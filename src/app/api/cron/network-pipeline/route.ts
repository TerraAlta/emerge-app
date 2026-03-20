import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { localNetworks } from '@/pipeline/sources/local-networks'
import { meetupCities } from '@/pipeline/sources/meetup-cities'
import { eventbriteCities } from '@/pipeline/sources/eventbrite-cities'
import { scoreQuest } from '@/pipeline/score-quest'
import type { RawEvent } from '@/pipeline/sources/types'

export const maxDuration = 300

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

async function processFetcher(name: string, fetchFn: () => Promise<RawEvent[]>) {
  const result = { source: name, fetched: 0, inserted: 0, filtered: 0, duplicates: 0, errors: 0 }

  let events: RawEvent[] = []
  try {
    events = await fetchFn()
    result.fetched = events.length
  } catch {
    result.errors++
    return result
  }

  // Geocode missing coordinates
  for (const event of events) {
    if (event.lat === 0 && event.lng === 0 && event.location_name && event.location_name !== 'See event page') {
      const geo = await geocodeAddress(event.location_name)
      if (geo) { event.lat = geo.lat; event.lng = geo.lng }
    }
  }
  events = events.filter(e => !(e.lat === 0 && e.lng === 0))

  for (const event of events) {
    try {
      // Dedup check by source_url
      if (event.source_url) {
        const { data } = await supabase.from('quests').select('id').eq('source_url', event.source_url).limit(1)
        if (data && data.length > 0) { result.duplicates++; continue }
      }

      const scored = await scoreQuest({
        title: event.title,
        description: event.description,
        location: event.location_name,
      })

      if (scored.ai_score < 50) { result.filtered++; continue }

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
    } catch {
      result.errors++
    }
  }

  return result
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = []

  // Local network scrapers
  results.push(await processFetcher('local-networks', () => localNetworks.fetch({})))

  // Meetup + Eventbrite with full keyword set
  results.push(await processFetcher('meetup-cities', () => meetupCities.fetch({})))
  results.push(await processFetcher('eventbrite-cities', () => eventbriteCities.fetch({})))

  const totals = {
    fetched: results.reduce((s, r) => s + r.fetched, 0),
    inserted: results.reduce((s, r) => s + r.inserted, 0),
    duplicates: results.reduce((s, r) => s + r.duplicates, 0),
    filtered: results.reduce((s, r) => s + r.filtered, 0),
    errors: results.reduce((s, r) => s + r.errors, 0),
  }

  return NextResponse.json({ ok: true, results, totals })
}
