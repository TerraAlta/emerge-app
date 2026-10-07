import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { createClient } from '@supabase/supabase-js'
import { costTracker, CostCapExceeded, DAILY_CRON_CAP_USD } from '@/pipeline/cost-cap'
import { importLumaEvents, storedKey } from '@/lib/luma'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Warm instances are reused between days — see CostTracker.reset().
  costTracker.reset(DAILY_CRON_CAP_USD)

  const { data: calendars, error } = await supabase
    .from('connected_calendars')
    .select('*')
    .eq('platform', 'luma')

  if (error || !calendars?.length) {
    return NextResponse.json({ ok: true, message: 'No Luma calendars connected', synced: 0 })
  }

  let totalInserted = 0
  let totalFiltered = 0
  let costCapped = false
  const seenKeys = new Set<string>()   // older duplicate rows of the same key sync once

  for (const cal of calendars) {
    try {
      const key = storedKey(cal)
      if (seenKeys.has(key)) continue
      seenKeys.add(key)

      const res = await fetch('https://api.lu.ma/public/v1/calendar/list-events', {
        headers: { 'x-luma-api-key': key, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        console.warn(`[sync-luma] ${cal.organiser_name}: API returned ${res.status}`)
        continue
      }
      const data = await res.json()
      const events = data.entries ?? data.events ?? []

      const result = await importLumaEvents(supabase, events, cal.organiser_name, cal.rejected_event_ids ?? [])
      totalInserted += result.inserted
      totalFiltered += result.filtered

      await supabase
        .from('connected_calendars')
        .update({ last_synced_at: new Date().toISOString(), rejected_event_ids: result.rejectedIds })
        .eq('id', cal.id)
    } catch (err) {
      if (err instanceof CostCapExceeded) {
        costCapped = true
        console.warn(`[sync-luma] ${err.message} — halting run.`)
        break
      }
      console.error(`[sync-luma] ${cal.organiser_name} failed:`, (err as Error).message)
    }
  }

  console.log(`[sync-luma] ${costTracker.summary()}`)
  return NextResponse.json({
    ok: true,
    calendars_synced: seenKeys.size,
    inserted: totalInserted,
    filtered: totalFiltered,
    costUsd: Number(costTracker.totalUsd.toFixed(4)),
    costCapped,
  })
}
