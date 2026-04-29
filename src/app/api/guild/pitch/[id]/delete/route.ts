/**
 * Hard-delete a Guild pitch the caller owns. Uses the service role so the
 * FK cascade to guild_pitch_matches / guild_pitch_watchlist works without
 * needing to grant DELETE on those tables to `authenticated`.
 *
 * Best-effort removes the hero image from the pitch-images storage bucket
 * before deleting the row. If the storage delete fails (already gone, etc.)
 * we still proceed — orphaned objects are harmless.
 *
 * POST body: none. Auth via Authorization: Bearer <access_token>.
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

  // Verify ownership before deleting anything
  const { data: row, error: fetchErr } = await supabase
    .from('guild_pitches')
    .select('user_id, hero_image_url')
    .eq('id', params.id)
    .single()
  if (fetchErr || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.user_id !== userId) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  // Best-effort: delete the hero image from storage if it lives in our bucket
  if (row.hero_image_url) {
    const marker = '/storage/v1/object/public/pitch-images/'
    const idx = row.hero_image_url.indexOf(marker)
    if (idx !== -1) {
      const path = row.hero_image_url.slice(idx + marker.length)
      const { error: storageErr } = await supabase.storage.from('pitch-images').remove([path])
      if (storageErr) console.error('[pitch-delete] storage remove failed:', storageErr.message)
    }
  }

  const { error: deleteErr } = await supabase
    .from('guild_pitches')
    .delete()
    .eq('id', params.id)
  if (deleteErr) {
    console.error('[pitch-delete] row delete failed:', deleteErr)
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
