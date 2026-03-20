/**
 * Network pipeline runner — scrapes local organisations + expanded Meetup/Eventbrite
 * across all soul document dimensions.
 *
 * Usage: npx tsx scripts/run-network-pipeline.ts [--dry-run]
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { localNetworks } from '../src/pipeline/sources/local-networks'
import { meetupCities } from '../src/pipeline/sources/meetup-cities'
import { eventbriteCities } from '../src/pipeline/sources/eventbrite-cities'
import { scoreQuest } from '../src/pipeline/score-quest'
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

interface SourceResult {
  source: string
  fetched: number
  scored: number
  inserted: number
  filtered: number
  duplicates: number
  errors: number
}

/** Check if an event already exists in the database */
async function eventExists(title: string, startsAt: string, sourceUrl: string | null): Promise<boolean> {
  // Check by source URL
  if (sourceUrl) {
    const { data } = await supabase
      .from('quests')
      .select('id')
      .eq('source_url', sourceUrl)
      .limit(1)
    if (data && data.length > 0) return true
  }

  // Check by title + starts_at
  const { data } = await supabase
    .from('quests')
    .select('id')
    .eq('title', title)
    .eq('starts_at', startsAt)
    .limit(1)
  return (data && data.length > 0) || false
}

async function processFetcher(
  name: string,
  fetchFn: () => Promise<RawEvent[]>,
): Promise<SourceResult> {
  const result: SourceResult = { source: name, fetched: 0, scored: 0, inserted: 0, filtered: 0, duplicates: 0, errors: 0 }

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

  // Geocode events with missing coordinates
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

  // Score and insert
  for (const event of events) {
    try {
      // Deduplication check
      const exists = await eventExists(event.title, event.starts_at, event.source_url)
      if (exists) {
        result.duplicates++
        continue
      }

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
  console.log(`\n🌐 Emerge Network Pipeline — Local Orgs + Expanded City Searches`)
  console.log(`Mode: ${dryRun ? 'DRY RUN (no DB writes)' : 'LIVE (writing to Supabase)'}`)
  console.log('─'.repeat(60))

  const startTime = Date.now()
  const results: SourceResult[] = []

  // Phase 1: Local network scrapers
  console.log('\n── Phase 1: Local Networks ──')
  results.push(await processFetcher('local-networks', () => localNetworks.fetch({})))

  // Phase 2: Expanded Meetup + Eventbrite with full keyword set
  console.log('\n── Phase 2: Meetup Cities (full keywords) ──')
  results.push(await processFetcher('meetup-cities', () => meetupCities.fetch({})))

  console.log('\n── Phase 3: Eventbrite Cities (full keywords) ──')
  results.push(await processFetcher('eventbrite-cities', () => eventbriteCities.fetch({})))

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Summary
  let totalFetched = 0, totalScored = 0, totalInserted = 0, totalFiltered = 0, totalDuplicates = 0, totalErrors = 0

  console.log('\n── Source Results ──')
  for (const r of results) {
    totalFetched += r.fetched
    totalScored += r.scored
    totalInserted += r.inserted
    totalFiltered += r.filtered
    totalDuplicates += r.duplicates
    totalErrors += r.errors
    console.log(`  ${r.source}: ${r.fetched} fetched, ${r.inserted} inserted, ${r.duplicates} dupes, ${r.filtered} filtered, ${r.errors} errors`)
  }

  console.log(`\n── Totals ──`)
  console.log(`  Fetched:    ${totalFetched}`)
  console.log(`  Scored:     ${totalScored}`)
  console.log(`  Inserted:   ${totalInserted}`)
  console.log(`  Duplicates: ${totalDuplicates}`)
  console.log(`  Filtered:   ${totalFiltered} (below score threshold)`)
  console.log(`  Errors:     ${totalErrors}`)
  console.log(`  Time:       ${elapsed}s`)
  console.log()
}

main().catch(console.error)
