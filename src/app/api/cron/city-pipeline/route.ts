import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { meetupCities } from '@/pipeline/sources/meetup-cities'
import { eventbriteCities } from '@/pipeline/sources/eventbrite-cities'
import { scoreQuest } from '@/pipeline/score-quest'
import { isPotentiallyRelevant } from '@/pipeline/pre-filter'
import { costTracker, CostCapExceeded, DAILY_CRON_CAP_USD } from '@/pipeline/cost-cap'
import { CITIES } from '@/pipeline/sources/cities'
import type { RawEvent, SourceFetcher } from '@/pipeline/sources/types'

export const maxDuration = 300 // 5 minutes max for Vercel

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Emerge-Pipeline/1.0', 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { /* skip */ }
  return null
}

async function processSource(name: string, source: SourceFetcher) {
  const result = { source: name, fetched: 0, prefiltered: 0, inserted: 0, filtered: 0, errors: 0 }

  let events: RawEvent[] = []
  try {
    events = await source.fetch({})
    result.fetched = events.length
  } catch {
    result.errors++
    return result
  }

  // COST PROTECTION — keyword pre-filter before any Claude call, matching the
  // weekly orchestrator. Both sources here are open-catalogue (bulk: true).
  if (source.bulk) {
    events = events.filter(isPotentiallyRelevant)
    result.prefiltered = result.fetched - events.length
  }

  // Geocode events missing coordinates
  for (const event of events) {
    if (event.lat === 0 && event.lng === 0 && event.location_name && event.location_name !== 'See event page') {
      const geo = await geocodeAddress(event.location_name)
      if (geo) {
        event.lat = geo.lat
        event.lng = geo.lng
      }
    }
  }
  events = events.filter(e => !(e.lat === 0 && e.lng === 0))

  // Score and insert
  for (const event of events) {
    try {
      const scored = await scoreQuest({
        title: event.title,
        description: event.description,
        location: event.location_name,
      })
      if (!scored) { result.errors++; continue }

      if (scored.ai_score < 50) {
        result.filtered++
        continue
      }

      const { error } = await supabase.from('quests').upsert(
        {
          title: event.title,
          description: event.description,
          category: scored.category,
          geog: `POINT(${event.lng} ${event.lat})`,
          address: event.location_name,
          starts_at: event.starts_at,
          ends_at: event.ends_at ?? null,
          source_url: event.source_url,
          source_name: event.source,
          ai_score: scored.ai_score,
          ai_reasoning: scored.ai_reasoning,
          image_url: event.image_url ?? null,
          max_participants: event.max_participants ?? null,
        },
        { onConflict: 'title,starts_at' }
      )

      if (error) result.errors++
      else result.inserted++
    } catch (err) {
      if (err instanceof CostCapExceeded) throw err
      result.errors++
    }
  }

  return result
}

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this header)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Warm instances are reused between days — see CostTracker.reset().
  costTracker.reset(DAILY_CRON_CAP_USD)

  const results = []
  let costCapped = false

  try {
    results.push(await processSource('meetup-cities', meetupCities))
    results.push(await processSource('eventbrite-cities', eventbriteCities))
  } catch (err) {
    if (!(err instanceof CostCapExceeded)) throw err
    costCapped = true
    console.warn(`[city-pipeline] ${err.message} — halting run.`)
  }

  const totals = {
    cities: CITIES.length,
    fetched: results.reduce((s, r) => s + r.fetched, 0),
    prefiltered: results.reduce((s, r) => s + r.prefiltered, 0),
    inserted: results.reduce((s, r) => s + r.inserted, 0),
    filtered: results.reduce((s, r) => s + r.filtered, 0),
    errors: results.reduce((s, r) => s + r.errors, 0),
    costUsd: Number(costTracker.totalUsd.toFixed(4)),
    costCapped,
  }

  console.log(`[city-pipeline] ${costTracker.summary()}`)

  return NextResponse.json({ ok: true, results, totals })
}
