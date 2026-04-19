/**
 * Stripe webhook — handles checkout.session.completed for Guild scoping payments.
 *
 * On a successful checkout:
 * 1. Mark guild_projects.paid = true, store Stripe session id in payment_id
 * 2. Fire-and-forget: call /api/guild/generate-scoping with X-Internal-Key
 *    so the doc is drafted in the background (can take ~30s, longer than
 *    Stripe's webhook timeout)
 * 3. Return 200 immediately
 *
 * The generated doc lands in 'matched' state — the client cannot see it
 * until Pedro approves it in /admin/guild.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function triggerScoping(projectId: string, origin: string) {
  try {
    const url = `${origin}/api/guild/generate-scoping`
    // Fire and forget — don't await the long generation
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_TRIGGER_KEY || '',
      },
      body: JSON.stringify({ projectId }),
    }).catch(e => console.error('[stripe-webhook] scoping trigger failed:', e))
  } catch (e) {
    console.error('[stripe-webhook] scoping trigger error:', e)
  }
}

export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 })
  }

  const rawBody = await request.text()

  let event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err: any) {
    console.error('[stripe-webhook] signature verify failed:', err?.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session: any = event.data.object
    const projectId = session?.metadata?.projectId

    if (!projectId) {
      console.warn('[stripe-webhook] no projectId in session metadata:', session?.id)
      return NextResponse.json({ received: true })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error: updateErr } = await supabase
      .from('guild_projects')
      .update({
        paid: true,
        payment_id: session.id,
        status: 'scoping',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    if (updateErr) {
      console.error('[stripe-webhook] project update failed:', updateErr)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    const origin = request.headers.get('origin')
      || process.env.NEXT_PUBLIC_APP_URL
      || 'https://emerge.terralta.org'
    await triggerScoping(projectId, origin)
  }

  return NextResponse.json({ received: true })
}
