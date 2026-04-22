/**
 * Daily lifecycle housekeeping for Guild pitches.
 *
 * 1. Find published pitches whose expires_at is in the past → set to 'expired',
 *    email owner with a one-click reactivate link.
 * 2. Find published pitches whose last_confirmed_active_at is > 4 months ago →
 *    email owner with a "confirm still active" one-click link (don't expire yet).
 *
 * Protected by CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'
import { signConfirmToken, signReactivateToken } from '@/lib/pitch-links'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CHECK_IN_THRESHOLD_DAYS = 120

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = { expired: 0, checkInEmails: 0, reactivateEmails: 0, errors: 0 }
  const appUrl = getAppUrl()
  const now = new Date()

  // 1. Expire published pitches whose expires_at has passed
  const { data: toExpire } = await supabase
    .from('guild_pitches')
    .select('id, user_id, title, one_line_vision')
    .eq('status', 'published')
    .lt('expires_at', now.toISOString())

  for (const pitch of toExpire || []) {
    try {
      await supabase
        .from('guild_pitches')
        .update({ status: 'expired', updated_at: now.toISOString() })
        .eq('id', pitch.id)
      results.expired++

      if (!isEmailConfigured()) continue
      const { data: authUser } = await supabase.auth.admin.getUserById(pitch.user_id)
      const email = authUser?.user?.email
      if (!email) continue
      const token = signReactivateToken(pitch.id)
      const reactivateUrl = `${appUrl}/api/guild/pitch/${pitch.id}/reactivate?t=${token}`
      await sendEmail({
        to: email,
        subject: `Your Guild pitch just expired — reactivate in one click`,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:560px;padding:24px 20px;color:#1a1a1a;line-height:1.6;">
            <h2 style="font-weight:300;font-size:22px;">Your pitch has expired</h2>
            <p><strong>${pitch.title}</strong> — ${pitch.one_line_vision || ''}</p>
            <p style="margin-top:12px;">Pitches on the Guild expire after 6 months to keep the board alive. If this project is still happening, reactivate in one click — it'll be live for another 6 months.</p>
            <p style="margin-top:20px;">
              <a href="${reactivateUrl}" style="display:inline-block;background:#C8913A;color:#fff;padding:12px 26px;border-radius:999px;text-decoration:none;font-weight:600;">Reactivate my pitch</a>
            </p>
            <p style="font-size:11px;color:#888;margin-top:24px;">If the project has wound down, you can also close it as "success" or "abandoned" from <a href="${appUrl}/guild/pitch/mine" style="color:#C8913A;">your pitches page</a>.</p>
          </div>`,
      })
      results.reactivateEmails++
    } catch (err: any) {
      console.error('[guild-pitch-lifecycle] expire failed:', err?.message)
      results.errors++
    }
  }

  // 2. Check-in reminders for published pitches older than 4 months since last confirm
  const checkInCutoff = new Date(now.getTime() - CHECK_IN_THRESHOLD_DAYS * 86_400_000)
  const { data: needsCheckIn } = await supabase
    .from('guild_pitches')
    .select('id, user_id, title, one_line_vision, last_confirmed_active_at')
    .eq('status', 'published')
    .lt('last_confirmed_active_at', checkInCutoff.toISOString())

  for (const pitch of needsCheckIn || []) {
    try {
      if (!isEmailConfigured()) continue
      const { data: authUser } = await supabase.auth.admin.getUserById(pitch.user_id)
      const email = authUser?.user?.email
      if (!email) continue
      // Respect digest preference
      const { data: prof } = await supabase
        .from('profiles').select('email_digest_enabled').eq('id', pitch.user_id).single()
      if (prof && prof.email_digest_enabled === false) continue

      const token = signConfirmToken(pitch.id)
      const confirmUrl = `${appUrl}/api/guild/pitch/${pitch.id}/confirm-active?t=${token}`
      await sendEmail({
        to: email,
        subject: `Is your Guild pitch still active?`,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:560px;padding:24px 20px;color:#1a1a1a;line-height:1.6;">
            <h2 style="font-weight:300;font-size:22px;">A quick check-in 🌱</h2>
            <p><strong>${pitch.title}</strong> — ${pitch.one_line_vision || ''}</p>
            <p style="margin-top:12px;">It's been 4 months since you last confirmed this pitch is still active. If it is, tap below and it stays live. If not — no action needed; it'll expire in 2 months.</p>
            <p style="margin-top:20px;">
              <a href="${confirmUrl}" style="display:inline-block;background:#C8913A;color:#fff;padding:12px 26px;border-radius:999px;text-decoration:none;font-weight:600;">Yes, still active</a>
            </p>
            <p style="font-size:11px;color:#888;margin-top:24px;">Manage your pitches at <a href="${appUrl}/guild/pitch/mine" style="color:#C8913A;">${appUrl.replace('https://', '')}/guild/pitch/mine</a></p>
          </div>`,
      })
      results.checkInEmails++
    } catch (err: any) {
      console.error('[guild-pitch-lifecycle] check-in failed:', err?.message)
      results.errors++
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
