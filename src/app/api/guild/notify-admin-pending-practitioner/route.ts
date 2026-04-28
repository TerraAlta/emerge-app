/**
 * Notify the Guild admin that a new practitioner just submitted their
 * profile for verification. Called from /guild/join after saveProfile.
 *
 * Auth: requires the caller's Supabase JWT and verifies they own the
 * practitioner record. Only fires once per practitioner (skipped if the
 * practitioner is already verified). The email is fixed-template so this
 * cannot be used to send arbitrary content.
 *
 * POST body: { practitionerId }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'
import { FLOWER_PETALS } from '@/lib/flower-petals'

const ADMIN_NOTIFY_EMAIL = process.env.GUILD_ADMIN_EMAIL || 'terraalta.sintra@gmail.com'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function authedUserId(request: NextRequest): Promise<string | null> {
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
    const userId = await authedUserId(request)
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { practitionerId } = await request.json()
    if (!practitionerId) return NextResponse.json({ error: 'Missing practitionerId' }, { status: 400 })

    const supabase = getServiceClient()
    const { data: p } = await supabase
      .from('guild_practitioners')
      .select('id, user_id, display_name, tagline, country, region, languages, flower_petals, specialties, verified')
      .eq('id', practitionerId)
      .single()

    if (!p || p.user_id !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (p.verified) return NextResponse.json({ ok: true, skipped: 'already verified' })
    if (!p.tagline) return NextResponse.json({ ok: true, skipped: 'profile incomplete' })

    const { data: u } = await supabase.auth.admin.getUserById(p.user_id)
    const email = u?.user?.email || 'unknown'

    if (!isEmailConfigured()) {
      return NextResponse.json({ ok: true, skipped: 'email not configured' })
    }

    const appUrl = getAppUrl()
    const petals = (p.flower_petals || []).map(petalLabel).join(' · ')
    const langs = (p.languages || []).join(', ')
    const specs = (p.specialties || []).slice(0, 6).join(', ')

    await sendEmail({
      to: ADMIN_NOTIFY_EMAIL,
      subject: `[Guild] New practitioner pending review — ${p.display_name || 'unnamed'}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; padding: 24px; line-height: 1.6; color: #1a1a1a;">
          <h2 style="font-weight: 300; font-size: 22px; margin: 0 0 12px;">New practitioner pending review</h2>
          <p style="margin: 0 0 4px;"><strong>${p.display_name || '(unnamed)'}</strong></p>
          <p style="margin: 0 0 4px; color: #555;">${p.tagline || ''}</p>
          <p style="margin: 0 0 4px; font-size: 13px; color: #666;">${[p.country, p.region].filter(Boolean).join(' · ')} · ${langs}</p>
          ${petals ? `<p style="margin: 0 0 4px; font-size: 13px; color: #666;">Petals: ${petals}</p>` : ''}
          ${specs ? `<p style="margin: 0 0 4px; font-size: 13px; color: #666;">Specialties: ${specs}</p>` : ''}
          <p style="margin: 4px 0 16px; font-size: 12px; color: #999;">${email}</p>
          <p><a href="${appUrl}/admin/guild" style="display:inline-block;background:#C8913A;color:white;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600;">Open review queue</a></p>
        </div>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[notify-admin-pending-practitioner]', err)
    return NextResponse.json({ error: err?.message || 'Notify failed' }, { status: 500 })
  }
}
