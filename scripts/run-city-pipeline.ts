/**
 * City-focused pipeline runner — scrapes Meetup and Eventbrite across 50 cities,
 * geocodes, scores with AI, and inserts into Supabase.
 *
 * Usage: npx tsx scripts/run-city-pipeline.ts [--dry-run]
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { meetupCities } from '../src/pipeline/sources/meetup-cities'
import { eventbriteCities } from '../src/pipeline/sources/eventbrite-cities'
import { scoreQuest } from '../src/pipeline/score-quest'
import { CITIES } from '../src/pipeline/sources/cities'
import type { RawEvent } from '../src/pipeline/sources/types'

// Load env
const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIndex = trimmed.indexOf('=')
  if (eqIndex === -1) continue
  const key = trimmed.slice(0, eqIndex)
  const val = trimmed.slice(eqIndex + 1)
  if (!process.env[key]) process.env[key] = val
}

const dryRun = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Geocode an address string to lat/lng via Nominatim */
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

/** Find the nearest city for an event based on coordinates */
function findNearestCity(lat: number, lng: number): string | null {
  let best = ''
  let bestDist = Infinity
  for (const city of CITIES) {
    const d = Math.hypot(city.lat - lat, city.lng - lng)
    if (d < bestDist) {
      bestDist = d
      best = `${city.name}, ${city.country}`
    }
  }
  return best || null
}

interface SourceResult {
  source: string
  fetched: number
  scored: number
  inserted: number
  filtered: number
  errors: number
}

async function processFetcher(
  name: string,
  fetchFn: () => Promise<RawEvent[]>,
): Promise<SourceResult> {
  const result: SourceResult = { source: name, fetched: 0, scored: 0, inserted: 0, filtered: 0, errors: 0 }

  // 1. Fetch
  let events: RawEvent[] = []
  try {
    events = await fetchFn()
    result.fetched = events.length
    console.log(`\n[${name}] Fetched ${events.length} events`)
  } catch (err) {
    console.error(`[${name}] Fetch failed:`, err)
    result.errors++
    return result
  }

  // 2. Geocode events with missing coordinates
  let geocoded = 0
  for (const event of events) {
    if (event.lat === 0 && event.lng === 0 && event.location_name && event.location_name !== 'See event page') {
      const geo = await geocodeAddress(event.location_name)
      if (geo) {
        event.lat = geo.lat
        event.lng = geo.lng
        geocoded++
      }
    }
  }
  if (geocoded > 0) console.log(`[${name}] Geocoded ${geocoded} events`)

  // Filter out events with no coordinates
  events = events.filter(e => !(e.lat === 0 && e.lng === 0))

  // 3. Score and insert
  for (const event of events) {
    try {
      const scored = await scoreQuest({
        title: event.title,
        description: event.description,
        location: event.location_name,
      })
      result.scored++

      if (scored.ai_score < 50) {
        result.filtered++
        continue
      }

      if (!dryRun) {
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

        if (error) {
          console.error(`[${name}] Insert failed for "${event.title}":`, error.message)
          result.errors++
        } else {
          result.inserted++
        }
      } else {
        result.inserted++
      }
    } catch (err) {
      console.error(`[${name}] Score failed for "${event.title}":`, (err as Error).message)
      result.errors++
    }
  }

  return result
}

async function main() {
  console.log(`\n🌍 Emerge City Pipeline — 50 Cities × Meetup + Eventbrite`)
  console.log(`Mode: ${dryRun ? 'DRY RUN (no DB writes)' : 'LIVE (writing to Supabase)'}`)
  console.log('─'.repeat(60))

  const startTime = Date.now()

  const results: SourceResult[] = []

  // Run both fetchers sequentially (each already rate-limits internally)
  results.push(await processFetcher('meetup-cities', () => meetupCities.fetch({})))
  results.push(await processFetcher('eventbrite-cities', () => eventbriteCities.fetch({})))

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Collect all inserted events for city/country breakdown
  let totalFetched = 0
  let totalScored = 0
  let totalInserted = 0
  let totalFiltered = 0
  let totalErrors = 0

  console.log('\n── Source Results ──')
  for (const r of results) {
    totalFetched += r.fetched
    totalScored += r.scored
    totalInserted += r.inserted
    totalFiltered += r.filtered
    totalErrors += r.errors
    console.log(`  ${r.source}: ${r.fetched} fetched, ${r.inserted} inserted, ${r.filtered} filtered, ${r.errors} errors`)
  }

  // Country breakdown from city list
  const countryCount: Record<string, number> = {}
  for (const city of CITIES) {
    countryCount[city.country] = (countryCount[city.country] || 0)
  }

  console.log('\n── Cities Covered ──')
  const countryCities: Record<string, string[]> = {}
  for (const city of CITIES) {
    if (!countryCities[city.country]) countryCities[city.country] = []
    countryCities[city.country].push(city.name)
  }
  for (const [country, cities] of Object.entries(countryCities).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${country} (${cities.length}): ${cities.join(', ')}`)
  }

  console.log(`\n── Totals ──`)
  console.log(`  Cities:   ${CITIES.length}`)
  console.log(`  Sources:  ${results.length}`)
  console.log(`  Fetched:  ${totalFetched}`)
  console.log(`  Scored:   ${totalScored}`)
  console.log(`  Inserted: ${totalInserted}`)
  console.log(`  Filtered: ${totalFiltered} (below score threshold)`)
  console.log(`  Errors:   ${totalErrors}`)
  console.log(`  Time:     ${elapsed}s`)
  console.log()
}

main().catch(console.error)
