/**
 * Admin — list pitches awaiting review.
 *
 * GET returns:
 *   - pending: pitches with status='pending_review'
 *   - recent:  last 10 published pitches for context
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: pending } = await supabase
    .from('guild_pitches')
    .select('id, user_id, title, one_line_vision, vision_long, offering, stage, commitment_level, country, region, language, flower_petals, roles_sought, seed_capital_range, contact_method, contact_value, hero_image_url, created_at, updated_at')
    .eq('status', 'pending_review')
    .order('updated_at', { ascending: false })

  const { data: recent } = await supabase
    .from('guild_pitches')
    .select('id, title, country, status, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(10)

  // Attach submitter email
  const pendingWithEmail = await Promise.all(
    (pending || []).map(async p => {
      const { data: u } = await supabase.auth.admin.getUserById(p.user_id)
      return { ...p, email: u?.user?.email || null }
    })
  )

  return NextResponse.json({ pending: pendingWithEmail, recent: recent || [] })
}
