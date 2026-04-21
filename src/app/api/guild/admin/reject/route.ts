/**
 * Admin rejects a Guild scoping doc — triggers full refund via Stripe.
 *
 * POST body: { projectId, reason }
 *
 * Sets rejected_at, refunds via Stripe, moves project to 'closed',
 * and emails the client with a refund notice.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { requireAdmin } from '@/lib/admin-auth'
import { getStripe } from '@/lib/stripe'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const { projectId, reason } = await request.json()
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

  const supabase = getServiceClient()

  const { data: project } = await supabase
    .from('guild_projects')
    .select('id, client_user_id, project_name, payment_id')
    .eq('id', projectId)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Refund via Stripe
  let refundId: string | null = null
  if (project.payment_id) {
    try {
      const stripe = getStripe()
      // payment_id stores the Stripe checkout session id — we need the PaymentIntent
      const session = await stripe.checkout.sessions.retrieve(project.payment_id)
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id
      if (paymentIntentId) {
        const refund = await stripe.refunds.create({ payment_intent: paymentIntentId })
        refundId = refund.id
      }
    } catch (e: any) {
      console.error('[guild-admin-reject] refund failed:', e?.message)
      return NextResponse.json({ error: `Refund failed: ${e?.message || 'unknown'}` }, { status: 500 })
    }
  }

  // Mark doc rejected
  await supabase
    .from('guild_scoping_docs')
    .update({
      rejected_at: new Date().toISOString(),
      admin_notes: reason || '',
    })
    .eq('project_id', projectId)

  // Close project
  await supabase
    .from('guild_projects')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('id', projectId)

  // Email client
  try {
    const { data: clientUser } = await supabase.auth.admin.getUserById(project.client_user_id)
    const email = clientUser?.user?.email
    if (email && isEmailConfigured()) {
      await sendEmail({
        to: email,
        subject: `Refund issued for your Guild scoping — ${project.project_name || 'your project'}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #1a1a1a; line-height: 1.6;">
            <h1 style="font-weight: 300; font-size: 24px; margin: 0 0 16px;">We have refunded your scoping</h1>
            <p>After reviewing the draft scoping document for <strong>${project.project_name || 'your project'}</strong>, we concluded it would not serve you well. We have issued a full refund to your payment method — it should arrive within 5-10 business days.</p>
            ${reason ? `<p><strong>Note from the reviewer:</strong><br/>${reason}</p>` : ''}
            <p style="margin-top: 24px;">If you would like to try the intake again — with a different focus or more detail — you are welcome to. Reply to this email and we will guide you.</p>
            <p style="font-size: 12px; color: #999; margin-top: 32px;">— The Guild · Emerge</p>
          </div>
        `,
      })
    }
  } catch (e) {
    console.error('[guild-admin-reject] email failed:', e)
  }

  return NextResponse.json({ ok: true, refundId })
}
