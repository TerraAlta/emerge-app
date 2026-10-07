/**
 * Admin review queue for events submitted by link (/api/submit-event).
 *
 * GET  → { pending, recent }
 * POST { id, action: 'approve' | 'reject' }
 *   approve: copies the submission into `quests` (service role, so it keeps
 *            its AI score and is attributed to the submitter) and marks it.
 *   reject:  marks it; nothing is published.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin-auth'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const supabase = db()
  const [{ data: pending }, { data: recent }] = await Promise.all([
    supabase.from('quest_submissions').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
    supabase.from('quest_submissions').select('id, title, status, ai_score, reviewed_at, created_at')
      .in('status', ['approved', 'rejected']).order('reviewed_at', { ascending: false }).limit(10),
  ])
  return NextResponse.json({ pending: pending ?? [], recent: recent ?? [] })
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id, action } = await request.json().catch(() => ({}))
  if (!id || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'id and action (approve|reject) required' }, { status: 400 })
  }
  const supabase = db()
  const { data: sub } = await supabase.from('quest_submissions').select('*').eq('id', id).eq('status', 'pending').single()
  if (!sub) return NextResponse.json({ error: 'Not found or already decided' }, { status: 404 })

  let questId: string | null = null
  if (action === 'approve') {
    if (!sub.starts_at || sub.lat == null || sub.lng == null) {
      return NextResponse.json({ error: 'This submission has no date or location — it can\'t be published as is.' }, { status: 422 })
    }
    const { data: saved, error } = await supabase.from('quests').upsert(
      {
        title: sub.title,
        description: sub.description ?? '',
        category: sub.category ?? 'community',
        geog: `POINT(${sub.lng} ${sub.lat})`,
        address: sub.address || 'See event page',
        starts_at: sub.starts_at,
        ends_at: sub.ends_at,
        source_url: sub.url,
        source_name: sub.organizer || 'user submission',
        ai_score: sub.ai_score,
        ai_reasoning: sub.ai_reasoning ?? '',
        image_url: sub.image_url,
        created_by: sub.submitted_by,
      },
      { onConflict: 'title,starts_at', ignoreDuplicates: true },
    ).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    questId = saved?.[0]?.id ?? null
  }

  await supabase.from('quest_submissions').update({
    status: action === 'approve' ? 'approved' : 'rejected',
    quest_id: questId,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true, published: action === 'approve', alreadyOnEmerge: action === 'approve' && !questId })
}
