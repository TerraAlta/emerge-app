import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
 * Notify admin of pipeline failure via Telegram + Supabase log.
 * Rate-limited to 1 alert per hour to avoid spam.
 */
export async function notifyPipelineFailure(
  reason: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    // 1. Check if we already alerted in the last hour
    const { data: recent } = await supabase
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
    await supabase.from('pipeline_errors').insert({
      reason,
      details,
    })

    // 3. Send Telegram alert
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
    const { data } = await supabase
      .from('quests')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
    return data?.[0]?.created_at ?? null
  } catch {
    return null
  }
}
