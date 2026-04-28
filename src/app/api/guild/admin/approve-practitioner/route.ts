/**
 * Admin approves a Guild practitioner.
 *
 * POST body: { practitionerId }
 *
 * Sets verified=true and emails the practitioner that they're live in
 * the directory.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'
import { requireAdmin } from '@/lib/admin-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const { practitionerId } = await request.json()
  if (!practitionerId) return NextResponse.json({ error: 'Missing practitionerId' }, { status: 400 })

  const supabase = getServiceClient()

  const { data: p } = await supabase
    .from('guild_practitioners')
    .select('id, user_id, display_name')
    .eq('id', practitionerId)
    .single()

  if (!p) return NextResponse.json({ error: 'Practitioner not found' }, { status: 404 })

  const { error: updErr } = await supabase
    .from('guild_practitioners')
    .update({ verified: true, updated_at: new Date().toISOString() })
    .eq('id', practitionerId)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  try {
    const { data: u } = await supabase.auth.admin.getUserById(p.user_id)
    const email = u?.user?.email
    const appUrl = getAppUrl()

    if (email && isEmailConfigured()) {
      await sendEmail({
        to: email,
        subject: `You're in — welcome to the Guild`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #1a1a1a; line-height: 1.6;">
            <h1 style="font-weight: 300; font-size: 26px; margin: 0 0 16px;">Welcome to the Guild${p.display_name ? `, ${p.display_name.split(' ')[0]}` : ''}</h1>
            <p>Your profile has been personally reviewed and you are now live in the practitioner directory. Clients searching for regenerative help in your region and petals will find you.</p>
            <p style="margin-top: 24px;"><a href="${appUrl}/guild" style="display: inline-block; background: #C8913A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 999px; font-weight: 600;">View the directory</a></p>
            <p style="margin-top: 24px; font-size: 13px; color: #555;">A few things worth knowing:</p>
            <ul style="font-size: 13px; color: #555; padding-left: 18px;">
              <li>Free listing, always — no commission, no paid placement.</li>
              <li>When a client commissions a scoping doc that fits your profile, we may suggest you to them.</li>
              <li>If you ever want to update your profile or pause your listing, reply to this email.</li>
            </ul>
            <p style="font-size: 12px; color: #999; margin-top: 32px;">— The Guild · Emerge</p>
          </div>
        `,
      })
    }
  } catch (e) {
    console.error('[approve-practitioner] email failed:', e)
    // Don't fail approval just because email hiccuped
  }

  return NextResponse.json({ ok: true })
}
