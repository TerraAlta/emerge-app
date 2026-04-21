/**
 * Admin approves a Guild scoping doc.
 *
 * POST body: { projectId, adminNotes?: string }
 *
 * Sets guild_scoping_docs.approved_at, moves project to 'delivered',
 * and emails the client with a link to view the doc.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'
import { requireAdmin } from '@/lib/admin-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const { projectId, adminNotes } = await request.json()
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

  const supabase = getServiceClient()

  const { data: project } = await supabase
    .from('guild_projects')
    .select('id, client_user_id, project_name')
    .eq('id', projectId)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Approve the doc
  const { error: docErr } = await supabase
    .from('guild_scoping_docs')
    .update({
      approved_at: new Date().toISOString(),
      admin_notes: adminNotes || '',
    })
    .eq('project_id', projectId)

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 })

  // Move project to delivered
  await supabase
    .from('guild_projects')
    .update({ status: 'delivered', updated_at: new Date().toISOString() })
    .eq('id', projectId)

  // Email client — fetch their email from auth.users via admin API
  try {
    const { data: clientUser } = await supabase.auth.admin.getUserById(project.client_user_id)
    const email = clientUser?.user?.email
    const appUrl = getAppUrl()

    if (email && isEmailConfigured()) {
      await sendEmail({
        to: email,
        subject: `Your Guild scoping doc is ready — ${project.project_name || 'your project'}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #1a1a1a; line-height: 1.6;">
            <h1 style="font-weight: 300; font-size: 26px; margin: 0 0 16px;">Your scoping doc is ready</h1>
            <p>We have personally reviewed the scoping document for <strong>${project.project_name || 'your project'}</strong> and it is now in your account.</p>
            <p>View it here:</p>
            <p><a href="${appUrl}/guild/project/${project.id}" style="display: inline-block; background: #C8913A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 999px; font-weight: 600;">Open scoping doc</a></p>
            <p style="margin-top: 32px; font-size: 13px; color: #666;">If anything feels off, reply to this email — we will revise or refund.</p>
            <p style="font-size: 12px; color: #999; margin-top: 32px;">— The Guild · Emerge</p>
          </div>
        `,
      })
    }
  } catch (e) {
    console.error('[guild-admin-approve] email failed:', e)
    // Don't fail approval just because email hiccuped
  }

  return NextResponse.json({ ok: true })
}
