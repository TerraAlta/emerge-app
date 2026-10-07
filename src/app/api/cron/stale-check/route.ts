import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { createClient } from '@supabase/supabase-js'
import { notifyPipelineFailure, emailAdmin } from '@/lib/pipeline-monitor'

export const maxDuration = 10

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Quests now arrive once a week, from the Sunday GitHub Actions sweep (the
// daily Vercel pipeline crons were removed — they could never finish inside
// the 300s function limit). Eight days = one missed Sunday plus slack, so
// this alarms on a real outage, not on every Tuesday.
const STALE_THRESHOLD_HOURS = 8 * 24

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!isCronAuthorized(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ?test=1 — send one sample alert email (nothing logged), to check the
  // alarm actually reaches the inbox.
  if (request.nextUrl.searchParams.get('test') === '1') {
    const emailed = await emailAdmin('pipeline_stale', { test: true })
    return NextResponse.json({ ok: true, test: true, emailed })
  }

  const { data } = await supabase
    .from('quests')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)

  const lastEventAt = data?.[0]?.created_at ?? null

  if (!lastEventAt) {
    await notifyPipelineFailure('pipeline_stale', { lastEventAt: null, message: 'No events in database' })
    return NextResponse.json({ ok: true, stale: true, lastEventAt: null })
  }

  const hoursSince = (Date.now() - new Date(lastEventAt).getTime()) / (1000 * 60 * 60)

  if (hoursSince > STALE_THRESHOLD_HOURS) {
    await notifyPipelineFailure('pipeline_stale', {
      lastEventAt,
      hoursSince: Math.round(hoursSince),
    })
    return NextResponse.json({ ok: true, stale: true, lastEventAt, hoursSince: Math.round(hoursSince) })
  }

  return NextResponse.json({ ok: true, stale: false, lastEventAt, hoursSince: Math.round(hoursSince) })
}
