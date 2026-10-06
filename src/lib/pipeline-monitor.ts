import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'

let _supabase: SupabaseClient | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

/** Detect Anthropic credit/billing errors */
export function isCreditError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as any
  const msg = e?.message ?? e?.error?.message ?? ''
  return (e?.status === 400 || e?.status === 402) && (
    msg.includes('credit balance') ||
    msg.includes('billing') ||
    msg.includes('payment')
  )
}

/** Detect rate limit errors */
export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  return (err as any)?.status === 429
}

/**
 * Reasons worth an email, with what to actually do about each. Anything not
 * listed (e.g. religious_content_rejected — the filter doing its job) is only
 * logged. Until 2026-10-06 nothing here reached a human: alerts went to
 * Telegram only, and TELEGRAM_BOT_TOKEN was never set in Vercel.
 */
const EMAIL_ALERTS: Record<string, { subject: string; action: string }> = {
  pipeline_stale: {
    subject: 'No new events in over a week',
    action: 'The Sunday pipeline probably didn\'t run or failed. Check the latest "Weekly pipeline" run at https://github.com/TerraAlta/emerge-app/actions — and the Anthropic balance at https://console.anthropic.com/settings/billing in case the AI ran out of credit.',
  },
  credits_exhausted: {
    subject: 'Claude AI credit has run out',
    action: 'Event scoring and the news feed stop until the balance is topped up at https://console.anthropic.com/settings/billing.',
  },
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function emailAdmin(reason: string, details: Record<string, unknown>): Promise<void> {
  const alert = EMAIL_ALERTS[reason]
  const to = process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (!alert || !to || !isEmailConfigured()) return
  const lastQuest = await getLastQuestTimestamp()
  const linkify = (t: string) => esc(t).replace(/(https:\/\/[^\s]+)/g, '<a href="$1">$1</a>')
  await sendEmail({
    to,
    subject: `⚠️ Emerge: ${alert.subject}`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;max-width:560px">
      <p><strong>${esc(alert.subject)}</strong></p>
      <p>${linkify(alert.action)}</p>
      <p style="color:#666;font-size:13px">Last new event: ${esc(lastQuest ?? 'unknown')}<br>
      Details: <code>${esc(JSON.stringify(details).slice(0, 300))}</code></p>
      <p style="color:#999;font-size:12px">At most one email per problem per hour. Sent by Emerge's pipeline monitor.</p>
    </div>`,
  })
}

/**
 * Notify admin of pipeline failure via email + Telegram + Supabase log.
 * Rate-limited to 1 alert per hour to avoid spam.
 */
export async function notifyPipelineFailure(
  reason: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    // 1. Check if we already alerted in the last hour
    const { data: recent } = await getSupabase()
      .from('pipeline_errors')
      .select('created_at')
      .eq('reason', reason)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .limit(1)

    if (recent?.length) {
      console.warn(`[pipeline-monitor] Suppressing duplicate alert for "${reason}" (already sent within 1h)`)
      return
    }

    // 2. Log to Supabase
    await getSupabase().from('pipeline_errors').insert({
      reason,
      details,
    })

    // 3. Email (the channel that actually reaches Pedro)
    await emailAdmin(reason, details)

    // 4. Send Telegram alert (only if a bot token is ever configured)
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID
    if (botToken && chatId) {
      const lastQuest = await getLastQuestTimestamp()
      const message = [
        '\u26a0\ufe0f *Emerge pipeline alert*',
        `Reason: \`${reason}\``,
        `Details: \`${JSON.stringify(details).slice(0, 200)}\``,
        `Last successful quest: ${lastQuest ?? 'unknown'}`,
        '',
        'Action: top up at console.anthropic.com/settings/billing',
      ].join('\n')

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      }).catch(() => { /* don't fail pipeline over telegram */ })
    } else {
      console.warn('[pipeline-monitor] No TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID — skipping Telegram alert')
    }
  } catch (err) {
    // Monitor itself must never crash the pipeline
    console.error('[pipeline-monitor] Failed to notify:', (err as Error).message)
  }
}

async function getLastQuestTimestamp(): Promise<string | null> {
  try {
    const { data } = await getSupabase()
      .from('quests')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
    return data?.[0]?.created_at ?? null
  } catch {
    return null
  }
}
