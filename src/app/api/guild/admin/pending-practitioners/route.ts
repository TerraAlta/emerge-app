/**
 * Admin — list practitioners awaiting verification.
 *
 * GET returns:
 *   - pending: practitioners with verified=false and a non-empty tagline
 *              (i.e. they completed the onboarding interview & saved profile)
 *   - recent:  last 10 verified practitioners for context
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
    .from('guild_practitioners')
    .select('id, user_id, display_name, tagline, bio, country, region, languages, flower_petals, specialties, climate_zones_worked, project_scales, years_experience, pdc_certified, advanced_certifications, rate_range, created_at')
    .eq('verified', false)
    .not('tagline', 'is', null)
    .neq('tagline', '')
    .order('created_at', { ascending: false })

  const { data: recent } = await supabase
    .from('guild_practitioners')
    .select('id, display_name, country, updated_at')
    .eq('verified', true)
    .order('updated_at', { ascending: false })
    .limit(10)

  // Attach email
  const pendingWithEmail = await Promise.all(
    (pending || []).map(async p => {
      const { data: u } = await supabase.auth.admin.getUserById(p.user_id)
      return { ...p, email: u?.user?.email || null }
    })
  )

  return NextResponse.json({ pending: pendingWithEmail, recent: recent || [] })
}
