/**
 * Reactivate an expired pitch. Sets status='published' + expires_at = now+6mo
 * + last_confirmed_active_at=now. Matching is NOT re-run automatically (owner
 * can edit and re-publish to trigger that).
 *
 * Supports both POST (cookie auth) and signed GET link from email.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signReactivateToken } from '@/lib/pitch-links'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function reactivate(pitchId: string) {
  const supabase = getServiceClient()
  const now = new Date()
  const expires = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
  await supabase
    .from('guild_pitches')
    .update({
      status: 'published',
      last_confirmed_active_at: now.toISOString(),
      expires_at: expires.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', pitchId)
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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authedUser(request)
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = getServiceClient()
  const { data: row } = await supabase
    .from('guild_pitches').select('user_id').eq('id', params.id).single()
  if (!row || row.user_id !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await reactivate(params.id)
  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(request.url)
  const token = url.searchParams.get('t')
  if (!token || token !== signReactivateToken(params.id)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  await reactivate(params.id)
  const app = process.env.NEXT_PUBLIC_APP_URL || 'https://emerge.terralta.org'
  return NextResponse.redirect(`${app}/guild/pitch/mine?reactivated=${params.id}`)
}
