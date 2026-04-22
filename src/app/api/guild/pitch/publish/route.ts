/**
 * Publish a pitch: status='draft' → 'published', set published_at,
 * expires_at (+6mo), last_confirmed_active_at. Kicks off matching job
 * via waitUntil so the response returns immediately.
 *
 * POST body: { pitchId }  — auth via Supabase session cookie
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'
import { getAppUrl } from '@/lib/app-url'

export const maxDuration = 30

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
        console.error('[pitch-publish] matching non-2xx:', r.status, body.slice(0, 300))
      }
    })
    .catch(e => console.error('[pitch-publish] matching failed:', e?.message || e))
  waitUntil(p)
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
      .select('id, user_id, status, title, one_line_vision')
      .eq('id', pitchId)
      .single()
    if (!pitch || pitch.user_id !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Require a title + one_line_vision before publishing
    if (!pitch.title?.trim() || !pitch.one_line_vision?.trim()) {
      return NextResponse.json({ error: 'Title and one-line vision are required before publishing' }, { status: 400 })
    }

    const now = new Date()
    const expires = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)

    await supabase
      .from('guild_pitches')
      .update({
        status: 'published',
        published_at: now.toISOString(),
        last_confirmed_active_at: now.toISOString(),
        expires_at: expires.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', pitchId)

    // Kick off matching (fire-and-forget via waitUntil)
    const origin = request.headers.get('origin') || getAppUrl()
    triggerMatching(pitchId, origin)

    return NextResponse.json({ ok: true, expiresAt: expires.toISOString() })
  } catch (err: any) {
    console.error('[pitch-publish]', err)
    return NextResponse.json({ error: err?.message || 'Publish failed' }, { status: 500 })
  }
}
