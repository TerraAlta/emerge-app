/**
 * Admin approves a pending pitch.
 *
 * POST body: { pitchId }
 *
 * Flips status from 'pending_review' to 'published', sets published_at +
 * expires_at (+6mo), kicks off practitioner matching in the background,
 * and emails the pitch owner that they're live.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'
import { requireAdmin } from '@/lib/admin-auth'

export const maxDuration = 30

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function triggerMatching(pitchId: string, origin: string) {
  const url = `${origin}/api/guild/pitch/match`
  const p = fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_TRIGGER_KEY || '' },
    body: JSON.stringify({ pitchId }),
  })
    .then(async r => {
      if (!r.ok) {
        const body = await r.text().catch(() => '')
        console.error('[approve-pitch] matching non-2xx:', r.status, body.slice(0, 300))
      }
    })
    .catch(e => console.error('[approve-pitch] matching failed:', e?.message || e))
  waitUntil(p)
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const { pitchId } = await request.json()
  if (!pitchId) return NextResponse.json({ error: 'Missing pitchId' }, { status: 400 })

  const supabase = getServiceClient()

  const { data: pitch } = await supabase
    .from('guild_pitches')
    .select('id, user_id, status, title')
    .eq('id', pitchId)
    .single()

  if (!pitch) return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })

  const now = new Date()
  const expires = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)

  const { error: updErr } = await supabase
    .from('guild_pitches')
    .update({
      status: 'published',
      published_at: now.toISOString(),
      last_confirmed_active_at: now.toISOString(),
      expires_at: expires.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', pitchId)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Kick off practitioner matching
  const origin = request.headers.get('origin') || getAppUrl()
  triggerMatching(pitchId, origin)

  // Email pitch owner
  try {
    const { data: u } = await supabase.auth.admin.getUserById(pitch.user_id)
    const email = u?.user?.email
    const appUrl = getAppUrl()

    if (email && isEmailConfigured()) {
      await sendEmail({
        to: email,
        subject: `Your pitch is live — ${pitch.title}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #1a1a1a; line-height: 1.6;">
            <h1 style="font-weight: 300; font-size: 26px; margin: 0 0 16px;">Your pitch is live</h1>
            <p>We have personally reviewed <strong>${pitch.title}</strong> and it is now visible in the Guild pitches directory.</p>
            <p>We are also looking for practitioners whose work matches what you described — matches will appear on your pitch page over the next few minutes.</p>
            <p style="margin-top: 24px;"><a href="${appUrl}/guild/pitch/${pitch.id}" style="display: inline-block; background: #C8913A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 999px; font-weight: 600;">View your pitch</a></p>
            <p style="font-size: 12px; color: #999; margin-top: 32px;">— The Guild · Emerge</p>
          </div>
        `,
      })
    }
  } catch (e) {
    console.error('[approve-pitch] email failed:', e)
  }

  return NextResponse.json({ ok: true, expiresAt: expires.toISOString() })
}
