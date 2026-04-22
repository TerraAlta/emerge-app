/**
 * One-click "still active" confirmation.
 * Supports both browser POST (cookie auth) and one-click email GET with a
 * signed token so the pitcher doesn't need to be logged in to confirm.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signConfirmToken } from '@/lib/pitch-links'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function confirm(pitchId: string) {
  const supabase = getServiceClient()
  await supabase
    .from('guild_pitches')
    .update({ last_confirmed_active_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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

  await confirm(params.id)
  return NextResponse.json({ ok: true })
}

/** One-click GET from email — redirects to the pitch page with a flash message. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(request.url)
  const token = url.searchParams.get('t')
  if (!token || token !== signConfirmToken(params.id)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  await confirm(params.id)
  // Redirect to the pitch's mine page with a success flash
  const app = process.env.NEXT_PUBLIC_APP_URL || 'https://emerge.terralta.org'
  return NextResponse.redirect(`${app}/guild/pitch/mine?confirmed=${params.id}`)
}
