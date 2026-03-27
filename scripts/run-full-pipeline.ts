/**
 * FULL pipeline runner — processes ALL cities × native keywords.
 * Designed to run locally (takes 1-3 hours depending on network).
 * No Vercel timeout constraints.
 *
 * Usage: npx tsx scripts/run-full-pipeline.ts [--dry-run] [--eventbrite-only] [--meetup-only]
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { scoreQuest } from '../src/pipeline/score-quest'
import { CITIES, type City } from '../src/pipeline/sources/cities'
import { getFullKeywordsForCity } from '../src/pipeline/sources/keyword-selector'
import { stripHtml, extractJsonLd } from '../src/pipeline/sources/utils'
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
const eventbriteOnly = process.argv.includes('--eventbrite-only')
const meetupOnly = process.argv.includes('--meetup-only')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const FETCH_TIMEOUT = 15_000
const RATE_LIMIT_MS = 1_500

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ───────────────────────────────────────────
// Eventbrite scraper (inline — no batch limit)
// ───────────────────────────────────────────
function countrySlug(country: string): string {
  const map: Record<string, string> = {
    'Portugal': 'portugal', 'Germany': 'germany', 'Netherlands': 'netherlands',
    'United Kingdom': 'united-kingdom', 'France': 'france', 'Belgium': 'belgium',
    'Spain': 'spain', 'Italy': 'italy', 'Switzerland': 'switzerland',
    'Malta': 'malta', 'Ireland': 'ireland', 'Austria': 'austria',
    'Luxembourg': 'luxembourg', 'Denmark': 'denmark', 'Finland': 'finland',
    'Iceland': 'iceland', 'Serbia': 'serbia', 'Slovenia': 'slovenia',
    'Hungary': 'hungary', 'Canada': 'canada', 'United States': 'united-states',
  }
  return map[country] ?? country.toLowerCase().replace(/\s+/g, '-')
}

async function scrapeEventbrite(city: City, keyword: string): Promise<RawEvent[]> {
  const slug = countrySlug(city.country)
  const url = `https://www.eventbrite.com/d/${slug}--${encodeURIComponent(city.name)}/${encodeURIComponent(keyword)}/?page=1`

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
  if (!res.ok) return []
  const html = await res.text()

  const events = extractJsonLd(html)
  // extractJsonLd already returns normalised RawEvent objects
  return events.map((ev: any) => ({
    ...ev,
    source: 'eventbrite-cities',
    // Use city coords as fallback if extraction missed them
    lat: ev.lat || city.lat,
    lng: ev.lng || city.lng,
    location_name: ev.location_name || city.name,
  })).filter((e: RawEvent) => e.title && e.starts_at)
}

// ───────────────────────────────────────────
// Meetup scraper (inline — no batch limit)
// ───────────────────────────────────────────
async function scrapeMeetup(city: City, keyword: string): Promise<RawEvent[]> {
  const url = `https://www.meetup.com/find/?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(city.name)}&source=EVENTS&distance=twentyFiveMiles`

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
  if (!res.ok) return []
  const html = await res.text()

  // Try JSON-LD first
  let events = extractJsonLd(html)

  // Try __NEXT_DATA__ Apollo state
  const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (ndMatch) {
    try {
      const nextData = JSON.parse(ndMatch[1])
      const apollo = nextData?.props?.pageProps?.__APOLLO_STATE__
      if (apollo) {
        for (const val of Object.values(apollo)) {
          const v = val as any
          if (v?.__typename === 'Event' && v?.eventUrl) {
            events.push({
              name: v.title || v.name || '',
              description: v.description || '',
              startDate: v.dateTime || '',
              endDate: v.endTime || undefined,
              url: v.eventUrl || '',
              location: { name: v.venue?.name || city.name, geo: { latitude: v.venue?.lat || city.lat, longitude: v.venue?.lng || city.lng } },
            })
          }
        }
      }
    } catch {}
  }

  // Normalise: JSON-LD events are already normalised, Apollo events have raw fields
  const seen = new Set<string>()
  return events
    .map((ev: any) => ({
      // extractJsonLd returns title/starts_at/source_url; Apollo has name/dateTime/eventUrl
      title: ev.title || ev.name || '',
      description: ev.description ? stripHtml(ev.description) : '',
      starts_at: ev.starts_at || ev.startDate || ev.dateTime || '',
      ends_at: ev.ends_at || ev.endDate || ev.endTime || undefined,
      location_name: ev.location_name || ev.location?.name || city.name,
      lat: ev.lat || parseFloat(ev.location?.geo?.latitude) || city.lat,
      lng: ev.lng || parseFloat(ev.location?.geo?.longitude) || city.lng,
      source_url: ev.source_url || ev.url || ev.eventUrl || '',
      source_id: ev.source_url || ev.url || ev.eventUrl || '',
      source: 'meetup-cities',
    }))
    .filter((e: RawEvent) => {
      if (!e.title || !e.starts_at || seen.has(e.source_url!)) return false
      seen.add(e.source_url!)
      return true
    })
}

// ───────────────────────────────────────────
// Country code from coordinates
// ───────────────────────────────────────────
const COUNTRY_CODE_MAP: Record<string, string> = {
  'Portugal': 'PT', 'Germany': 'DE', 'Netherlands': 'NL', 'United Kingdom': 'GB',
  'France': 'FR', 'Belgium': 'BE', 'Spain': 'ES', 'Italy': 'IT',
  'Switzerland': 'CH', 'Malta': 'MT', 'Ireland': 'IE', 'Austria': 'AT',
  'Luxembourg': 'LU', 'Denmark': 'DK', 'Finland': 'FI', 'Iceland': 'IS',
  'Serbia': 'RS', 'Slovenia': 'SI', 'Hungary': 'HU', 'Canada': 'CA',
  'United States': 'US',
}

// ───────────────────────────────────────────
// Main
// ───────────────────────────────────────────
async function main() {
  const allRaw: RawEvent[] = []
  const seen = new Set<string>()
  const stats = { cities: 0, searches: 0, rawEvents: 0, scored: 0, inserted: 0, filtered: 0, errors: 0 }

  console.log(`\n🌍 Emerge FULL Pipeline — ${CITIES.length} cities × native keywords`)
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE (inserting to DB)'}`)
  if (eventbriteOnly) console.log('Source: Eventbrite only')
  if (meetupOnly) console.log('Source: Meetup only')
  console.log('─'.repeat(60))

  // Phase 1: Fetch all events
  for (const city of CITIES) {
    const keywords = getFullKeywordsForCity(city)
    stats.cities++
    let cityEvents = 0

    for (const keyword of keywords) {
      stats.searches++

      // Eventbrite
      if (!meetupOnly) {
        try {
          const events = await scrapeEventbrite(city, keyword)
          for (const ev of events) {
            const key = ev.source_url || `${ev.title}|${ev.starts_at}`
            if (seen.has(key)) continue
            seen.add(key)
            allRaw.push(ev)
            cityEvents++
          }
        } catch {}
        await sleep(RATE_LIMIT_MS)
      }

      // Meetup
      if (!eventbriteOnly) {
        try {
          const events = await scrapeMeetup(city, keyword)
          for (const ev of events) {
            const key = ev.source_url || `${ev.title}|${ev.starts_at}`
            if (seen.has(key)) continue
            seen.add(key)
            allRaw.push(ev)
            cityEvents++
          }
        } catch {}
        await sleep(RATE_LIMIT_MS)
      }
    }

    if (cityEvents > 0) {
      console.log(`✓ ${city.name}, ${city.country}: ${cityEvents} events`)
    } else {
      console.log(`· ${city.name}, ${city.country}: 0 events`)
    }
  }

  stats.rawEvents = allRaw.length
  console.log(`\n📊 Phase 1 complete: ${stats.rawEvents} unique raw events from ${stats.cities} cities (${stats.searches} searches)`)

  if (dryRun) {
    console.log('\n🏁 DRY RUN — no scoring or DB writes')
    // Show country breakdown
    const byCountry: Record<string, number> = {}
    for (const ev of allRaw) {
      const country = ev.source === 'eventbrite-cities' ? 'EB' : 'MU'
      byCountry[country] = (byCountry[country] || 0) + 1
    }
    console.log('By source:', byCountry)
    return
  }

  // Phase 2: Score and insert
  console.log(`\n🧠 Phase 2: Scoring ${allRaw.length} events with AI...`)
  let scoreCount = 0

  for (const event of allRaw) {
    scoreCount++
    if (scoreCount % 25 === 0) {
      console.log(`  Scoring ${scoreCount}/${allRaw.length}...`)
    }

    try {
      const scored = await scoreQuest({
        title: event.title,
        description: event.description,
        location: event.location_name,
      })

      if (!scored) { stats.errors++; continue }
      stats.scored++

      if (scored.ai_score < 50) {
        stats.filtered++
        continue
      }

      // Determine country code from nearest city
      const nearest = CITIES.reduce((best, c) => {
        const d = Math.hypot(c.lat - event.lat, c.lng - event.lng)
        return d < best.d ? { city: c, d } : best
      }, { city: CITIES[0], d: Infinity })
      const cc = COUNTRY_CODE_MAP[nearest.city.country] || null

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
          country_code: cc,
        },
        { onConflict: 'title,starts_at' }
      )

      if (error) { stats.errors++; console.warn(`  DB error: ${error.message}`) }
      else stats.inserted++
    } catch (err) {
      stats.errors++
    }
  }

  console.log(`\n🏁 Pipeline complete!`)
  console.log(`  Cities: ${stats.cities}`)
  console.log(`  Searches: ${stats.searches}`)
  console.log(`  Raw events: ${stats.rawEvents}`)
  console.log(`  Scored: ${stats.scored}`)
  console.log(`  Inserted: ${stats.inserted}`)
  console.log(`  Filtered (score <50): ${stats.filtered}`)
  console.log(`  Errors: ${stats.errors}`)
}

main().catch(console.error)
