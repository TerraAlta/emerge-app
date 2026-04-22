/**
 * Toggle watching a pitch. POST = watch, DELETE = unwatch.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authedUser(request)
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = getServiceClient()
  const { error } = await supabase.from('guild_pitch_watchlist').upsert(
    { pitch_id: params.id, user_id: userId },
    { onConflict: 'pitch_id,user_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authedUser(request)
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = getServiceClient()
  await supabase.from('guild_pitch_watchlist').delete()
    .eq('pitch_id', params.id).eq('user_id', userId)
  return NextResponse.json({ ok: true })
}
