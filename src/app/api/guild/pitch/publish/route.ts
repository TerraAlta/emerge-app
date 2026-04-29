/**
 * Submit a pitch for admin review: status='draft' → 'pending_review'.
 *
 * Pitches are NOT auto-published. They wait in the admin queue at
 * /admin/guild until Pedro approves, at which point status flips to
 * 'published' and matching kicks off (see approve-pitch route).
 *
 * If a pitch is already 'published' (e.g. owner re-publishing after pause),
 * we keep the existing behaviour: bump expires_at and re-confirm active.
 *
 * POST body: { pitchId }  — auth via Supabase session cookie
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'
import { FLOWER_PETALS } from '@/lib/flower-petals'

export const maxDuration = 30

const ADMIN_NOTIFY_EMAIL = process.env.GUILD_ADMIN_EMAIL || 'terraalta.sintra@gmail.com'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function authedUser(request: NextRequest): Promise<string | null> {
  const token =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.cookies.get('sb-access-token')?.value
  if (!token) return null
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data } = await anon.auth.getUser(token)
  return data.user?.id || null
}

function petalLabel(key: string): string {
  return FLOWER_PETALS.find(p => p.key === key)?.label || key
}

export async function POST(request: NextRequest) {
  try {
    const userId = await authedUser(request)
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { pitchId } = await request.json()
    if (!pitchId) return NextResponse.json({ error: 'Missing pitchId' }, { status: 400 })

    const supabase = getServiceClient()

    // Verify ownership
    const { data: pitch } = await supabase
      .from('guild_pitches')
      .select('id, user_id, status, title, one_line_vision, country, region, language, flower_petals')
      .eq('id', pitchId)
      .single()
    if (!pitch || pitch.user_id !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Require a title + one_line_vision before submitting
    if (!pitch.title?.trim() || !pitch.one_line_vision?.trim()) {
      return NextResponse.json({ error: 'Title and one-line vision are required before publishing' }, { status: 400 })
    }

    const now = new Date()
    const expires = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)

    // If already published (edit by the owner), keep it live and refresh expiry,
    // then notify the admin so they can spot-check the edit.
    if (pitch.status === 'published') {
      const { error: refreshErr } = await supabase
        .from('guild_pitches')
        .update({
          last_confirmed_active_at: now.toISOString(),
          expires_at: expires.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', pitchId)
      if (refreshErr) {
        console.error('[pitch-publish] re-publish update failed:', refreshErr)
        return NextResponse.json({ error: refreshErr.message }, { status: 500 })
      }

      // Edit notification — fire-and-forget, never block the response
      try {
        if (isEmailConfigured()) {
          const { data: u } = await supabase.auth.admin.getUserById(userId)
          const submitterEmail = u?.user?.email || 'unknown'
          const appUrl = getAppUrl()
          await sendEmail({
            to: ADMIN_NOTIFY_EMAIL,
            subject: `[Guild] Published pitch edited — ${pitch.title}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; padding: 24px; line-height: 1.6; color: #1a1a1a;">
                <h2 style="font-weight: 300; font-size: 22px; margin: 0 0 12px;">A live pitch was edited</h2>
                <p style="margin: 0 0 4px;"><strong>${pitch.title}</strong></p>
                <p style="margin: 0 0 4px; color: #555;">${pitch.one_line_vision || ''}</p>
                <p style="margin: 4px 0 16px; font-size: 12px; color: #999;">edited by ${submitterEmail}</p>
                <p><a href="${appUrl}/guild/pitch/${pitchId}" style="display:inline-block;background:#C8913A;color:white;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600;">Open the pitch</a></p>
                <p style="margin-top:16px; font-size:12px; color:#999;">No action needed — this is FYI. The edit is already live.</p>
              </div>
            `,
          })
        }
      } catch (e) {
        console.error('[pitch-publish] edit notify failed:', e)
      }

      return NextResponse.json({ ok: true, status: 'published', expiresAt: expires.toISOString() })
    }

    // First-time submit (or re-submit from draft) → go to admin review
    const { error: submitErr } = await supabase
      .from('guild_pitches')
      .update({
        status: 'pending_review',
        updated_at: now.toISOString(),
      })
      .eq('id', pitchId)
    if (submitErr) {
      console.error('[pitch-publish] submit update failed:', submitErr)
      return NextResponse.json({ error: submitErr.message }, { status: 500 })
    }

    // Notify admin
    try {
      if (isEmailConfigured()) {
        const { data: u } = await supabase.auth.admin.getUserById(userId)
        const submitterEmail = u?.user?.email || 'unknown'
        const appUrl = getAppUrl()
        const petals = (pitch.flower_petals || []).map(petalLabel).join(' · ')

        await sendEmail({
          to: ADMIN_NOTIFY_EMAIL,
          subject: `[Guild] New pitch pending review — ${pitch.title}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; padding: 24px; line-height: 1.6; color: #1a1a1a;">
              <h2 style="font-weight: 300; font-size: 22px; margin: 0 0 12px;">New pitch pending review</h2>
              <p style="margin: 0 0 4px;"><strong>${pitch.title}</strong></p>
              <p style="margin: 0 0 4px; color: #555;">${pitch.one_line_vision || ''}</p>
              <p style="margin: 0 0 4px; font-size: 13px; color: #666;">${[pitch.country, pitch.region].filter(Boolean).join(' · ')}${pitch.language ? ` · ${pitch.language}` : ''}</p>
              ${petals ? `<p style="margin: 0 0 4px; font-size: 13px; color: #666;">Petals: ${petals}</p>` : ''}
              <p style="margin: 4px 0 16px; font-size: 12px; color: #999;">${submitterEmail}</p>
              <p><a href="${appUrl}/admin/guild" style="display:inline-block;background:#C8913A;color:white;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600;">Open review queue</a></p>
            </div>
          `,
        })
      }
    } catch (e) {
      console.error('[pitch-publish] admin notify failed:', e)
    }

    return NextResponse.json({ ok: true, status: 'pending_review' })
  } catch (err: any) {
    console.error('[pitch-publish]', err)
    return NextResponse.json({ error: err?.message || 'Submit failed' }, { status: 500 })
  }
}
