import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyPipelineFailure } from '@/lib/pipeline-monitor'

export const maxDuration = 10

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STALE_THRESHOLD_HOURS = 48

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data } = await supabase
    .from('quests')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)

  const lastEventAt = data?.[0]?.created_at ?? null

  if (!lastEventAt) {
    await notifyPipelineFailure('pipeline_stale', { lastEventAt: null, message: 'No quests in database' })
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
