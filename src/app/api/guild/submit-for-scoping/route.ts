/**
 * Submit a Guild project for scoping — FREE while the Guild is small.
 *
 * Replaces the Stripe checkout step. The Stripe routes (/api/guild/checkout,
 * /api/stripe/webhook) and lib/stripe.ts are kept in place, just not called —
 * we'll wire payment back on once we have ~100 verified practitioners.
 *
 * POST body: { projectId }
 * Returns:   { ok: true }
 *
 * Verifies the caller owns the project, moves status to 'scoping', and
 * fires generate-scoping in the background (waitUntil) using the same
 * pattern the Stripe webhook uses. The drafted doc lands in 'matched' state
 * and goes through the existing /admin/guild review queue before delivery.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'
import { getAppUrl } from '@/lib/app-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
        console.error('[submit-for-scoping] generate trigger non-2xx:', res.status, body.slice(0, 300))
      }
    })
    .catch(e => console.error('[submit-for-scoping] generate trigger failed:', e?.message || e))
  waitUntil(p)
}

export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json()
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

    const accessToken = request.headers.get('authorization')?.replace('Bearer ', '')
      || request.cookies.get('sb-access-token')?.value

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}
    )
    const { data: userData } = await authClient.auth.getUser(accessToken)
    const userId = userData?.user?.id

    const { data: project, error: projectErr } = await serviceClient
      .from('guild_projects')
      .select('id, client_user_id, status, intake_transcript, extracted_brief')
      .eq('id', projectId)
      .single()

    if (projectErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (userId && project.client_user_id !== userId) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
    }
    if (project.status !== 'intake') {
      return NextResponse.json({ error: 'Project already submitted' }, { status: 400 })
    }
    if (!project.extracted_brief || Object.keys(project.extracted_brief).length === 0) {
      return NextResponse.json({ error: 'Intake not complete yet' }, { status: 400 })
    }

    const { error: updateErr } = await serviceClient
      .from('guild_projects')
      .update({
        status: 'scoping',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    if (updateErr) {
      return NextResponse.json({ error: 'Could not submit project' }, { status: 500 })
    }

    const origin = request.headers.get('origin') || getAppUrl()
    triggerScoping(projectId, origin)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[submit-for-scoping]', err)
    return NextResponse.json({ error: err?.message || 'Submission failed' }, { status: 500 })
  }
}
