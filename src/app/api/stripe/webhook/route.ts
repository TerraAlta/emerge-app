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
import { waitUntil } from '@vercel/functions'
import { getAppUrl } from '@/lib/app-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Kicks /api/guild/generate-scoping so the doc drafts in the background.
 * Uses Vercel's waitUntil so the serverless instance stays alive past the
 * 200 response — without it, Vercel kills the fetch the moment we return.
 */
function triggerScoping(projectId: string, origin: string) {
  const url = `${origin}/api/guild/generate-scoping`
  const p = fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': process.env.INTERNAL_TRIGGER_KEY || '',
    },
    body: JSON.stringify({ projectId }),
  })
    .then(async res => {
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error('[stripe-webhook] scoping trigger non-2xx:', res.status, body.slice(0, 300))
      }
    })
    .catch(e => console.error('[stripe-webhook] scoping trigger failed:', e?.message || e))
  waitUntil(p)
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

    const origin = request.headers.get('origin') || getAppUrl()
    triggerScoping(projectId, origin)
  }

  return NextResponse.json({ received: true })
}
