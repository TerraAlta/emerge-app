/**
 * FULL pipeline v2 — scrape → pre-filter → parallel score → insert
 * Fixes: pre-filters by keyword relevance before AI scoring,
 * scores 5 events concurrently, streams to DB immediately.
 *
 * Usage: npx tsx scripts/run-full-pipeline-v2.ts [--dry-run] [--eventbrite-only] [--score-only]
 */
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { scoreQuest, CostCapExceeded } from '../src/pipeline/score-quest'
import { CITIES, type City } from '../src/pipeline/sources/cities'
import { getFullKeywordsForCity } from '../src/pipeline/sources/keyword-selector'
import { stripHtml, extractJsonLd } from '../src/pipeline/sources/utils'
import { runPipeline } from '../src/pipeline/orchestrator'
import { isPotentiallyRelevant } from '../src/pipeline/pre-filter'
import { costTracker } from '../src/pipeline/cost-cap'

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
const scoreOnly = process.argv.includes('--score-only')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const FETCH_TIMEOUT = 15_000
const RATE_LIMIT_MS = 1_500
const CONCURRENCY = 5
const RAW_CACHE_FILE = resolve(process.cwd(), 'pipeline-cache.json')

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`
  console.log(line)
  appendFileSync('/Users/pedrovaldjiu/emerge-pipeline-v2.log', line + '\n')
}

// Pre-filter lives in src/pipeline/pre-filter.ts — shared with orchestrator
// so Phase 0 bulk sources (eventbrite-cultural etc.) get the same protection.
const preFilter = isPotentiallyRelevant

// ── Country code map ──
const CC: Record<string, string> = {
  'Portugal': 'PT', 'Germany': 'DE', 'Netherlands': 'NL', 'United Kingdom': 'GB',
  'France': 'FR', 'Belgium': 'BE', 'Spain': 'ES', 'Italy': 'IT',
  'Switzerland': 'CH', 'Malta': 'MT', 'Ireland': 'IE', 'Austria': 'AT',
  'Luxembourg': 'LU', 'Denmark': 'DK', 'Finland': 'FI', 'Iceland': 'IS',
  'Serbia': 'RS', 'Slovenia': 'SI', 'Hungary': 'HU', 'Canada': 'CA',
  'United States': 'US',
}

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

// ── Scrapers ──
/**
 * Why the counters: between 2026-06-29 and 2026-08-10 every one of the 220
 * cities silently returned 0 events. The scraper was fine — Eventbrite was
 * throttling mid-run — but a bare `catch {}` meant seven weeks of runs looked
 * identical to healthy ones in the log. Never swallow a scrape failure again.
 */
const fetchStats = { ok: 0, httpFail: 0, netFail: 0, emptyHtml: 0, lastStatus: 0 }

async function scrapeEventbrite(city: City, keyword: string): Promise<any[]> {
  const slug = countrySlug(city.country)
  const url = `https://www.eventbrite.com/d/${slug}--${encodeURIComponent(city.name)}/${encodeURIComponent(keyword)}/?page=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
  if (!res.ok) {
    fetchStats.httpFail++
    fetchStats.lastStatus = res.status
    return []
  }
  fetchStats.ok++
  const html = await res.text()
  if (!html.includes('application/ld+json')) fetchStats.emptyHtml++
  const events = extractJsonLd(html)
  return events.map((ev: any) => ({
    ...ev,
    source: 'eventbrite',
    lat: ev.lat || city.lat,
    lng: ev.lng || city.lng,
    location_name: ev.location_name || city.name,
    _country: city.country,
  })).filter((e: any) => e.title && e.starts_at)
}

// ── Parallel score + insert ──
async function scoreAndInsert(events: any[], stats: any) {
  // Process in batches of CONCURRENCY
  for (let i = 0; i < events.length; i += CONCURRENCY) {
    const batch = events.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(async (event) => {
        try {
          const scored = await scoreQuest({
            title: event.title,
            description: event.description || '',
            location: event.location_name || '',
          })
          if (!scored) { stats.errors++; return }
          stats.scored++

          if (scored.ai_score < 50) {
            stats.filtered++
            return
          }

          if (dryRun) {
            stats.inserted++
            log(`  ✓ [${scored.ai_score}] ${scored.category} — ${event.title}`)
            return
          }

          const cc = CC[event._country] || null
          const { error } = await supabase.from('quests').upsert(
            {
              title: event.title,
              description: event.description || '',
              category: scored.category,
              geog: `POINT(${event.lng} ${event.lat})`,
              address: event.location_name || '',
              starts_at: event.starts_at,
              ends_at: event.ends_at ?? null,
              source_url: event.source_url || '',
              source_name: event.source || '',
              ai_score: scored.ai_score,
              ai_reasoning: scored.ai_reasoning,
              image_url: event.image_url ?? null,
              country_code: cc,
            },
            { onConflict: 'title,starts_at' }
          )
          if (error) {
            stats.errors++
          } else {
            stats.inserted++
            log(`  ✓ [${scored.ai_score}] ${scored.category} — ${event.title}`)
          }
        } catch (err: any) {
          // Cost cap is a hard stop — propagate to main().
          if (err instanceof CostCapExceeded) throw err
          stats.errors++
          if (err?.message?.includes('credit balance')) {
            log(`  ⚠️ CREDITS EXHAUSTED — stopping scoring`)
            throw new Error('CREDITS_EXHAUSTED')
          }
        }
      })
    )

    // Check if any threw credits exhausted
    for (const r of results) {
      if (r.status === 'rejected' && r.reason?.message === 'CREDITS_EXHAUSTED') {
        log(`\n💸 Anthropic credits exhausted after scoring ${stats.scored} events`)
        return false
      }
    }

    if ((i + CONCURRENCY) % 50 === 0) {
      log(`  Progress: ${i + CONCURRENCY}/${events.length} scored, ${stats.inserted} inserted, ${stats.filtered} filtered`)
    }
  }
  return true
}

// ── Main ──
async function main() {
  const stats = { cities: 0, searches: 0, rawEvents: 0, preFiltered: 0, scored: 0, inserted: 0, filtered: 0, errors: 0 }

  log(`\n🌍 Emerge FULL Pipeline v2 — ${CITIES.length} cities + 234 network sources`)
  log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'} | Concurrency: ${CONCURRENCY}`)
  log('─'.repeat(60))

  // ── Phase 0: Run all 234 network sources via orchestrator ──
  if (!scoreOnly) {
    log(`\n🌐 Phase 0: Running 234 network sources (orchestrator)...`)
    try {
      const orchResults = await runPipeline({
        scoreThreshold: 50,
        dryRun,
        supabase: dryRun ? undefined : supabase,
        cacheOnly: false,  // Normal mode: fetch, score, and insert
      })
      let orchTotal = 0, orchInserted = 0, orchFiltered = 0, orchErrors = 0
      for (const r of orchResults) {
        orchTotal += r.fetched
        orchInserted += r.inserted
        orchFiltered += r.filtered
        orchErrors += r.errors
        if (r.fetched > 0) {
          log(`  ✓ ${r.source}: ${r.fetched} fetched → ${r.inserted} inserted, ${r.filtered} filtered`)
        }
      }
      log(`\n📊 Phase 0 complete: ${orchTotal} fetched → ${orchInserted} inserted, ${orchFiltered} filtered, ${orchErrors} errors`)
    } catch (err: any) {
      // CostCapExceeded must NOT be swallowed — re-throw so the run halts.
      if (err instanceof CostCapExceeded) throw err
      log(`  ⚠️ Orchestrator error: ${err.message} — continuing with Eventbrite...`)
    }
  }

  let allFiltered: any[] = []

  // Check if we have a cache from a previous scraping run
  if (scoreOnly && existsSync(RAW_CACHE_FILE)) {
    log(`📂 Loading cached raw events from ${RAW_CACHE_FILE}`)
    const cached = JSON.parse(readFileSync(RAW_CACHE_FILE, 'utf-8'))
    allFiltered = cached
    stats.rawEvents = cached.length
    stats.preFiltered = cached.length
    log(`  Loaded ${cached.length} pre-filtered events`)
  } else {
    // Phase 1: Scrape — process one city at a time, pre-filter immediately
    const seen = new Set<string>()
    let citiesWithRawEvents = 0

    for (const city of CITIES) {
      const keywords = getFullKeywordsForCity(city)
      stats.cities++
      let cityRaw = 0
      let cityFiltered = 0

      for (const keyword of keywords) {
        stats.searches++
        try {
          const events = await scrapeEventbrite(city, keyword)
          for (const ev of events) {
            const key = ev.source_url || `${ev.title}|${ev.starts_at}`
            if (seen.has(key)) continue
            seen.add(key)
            cityRaw++
            stats.rawEvents++

            if (preFilter(ev)) {
              allFiltered.push(ev)
              cityFiltered++
              stats.preFiltered++
            }
          }
        } catch {
          fetchStats.netFail++
        }
        await sleep(RATE_LIMIT_MS)
      }

      if (cityRaw > 0) citiesWithRawEvents++
      log(`${cityFiltered > 0 ? '✓' : '·'} ${city.name}, ${city.country}: ${cityRaw} raw → ${cityFiltered} relevant`)
    }

    log(`\n📊 Phase 1: ${stats.rawEvents} raw → ${stats.preFiltered} pre-filtered (${Math.round(stats.preFiltered / Math.max(1, stats.rawEvents) * 100)}% pass rate)`)
    log(`   Fetches: ${fetchStats.ok} ok, ${fetchStats.httpFail} HTTP-rejected (last status ${fetchStats.lastStatus || 'n/a'}), ${fetchStats.netFail} network/timeout, ${fetchStats.emptyHtml} returned pages with no event data`)

    // A healthy run pulls raw events from well over half the cities. Anything
    // far below that means we are being throttled, not that the world went
    // quiet. Count RAW hits, not pre-filtered ones — pre-filter legitimately
    // rejects ~94%, so measuring it here would cry wolf on a healthy run.
    if (citiesWithRawEvents < CITIES.length * 0.2) {
      log(`   ⚠️  BLOCK SUSPECTED: only ${citiesWithRawEvents}/${CITIES.length} cities returned anything.`)
      log(`      Eventbrite is almost certainly rate-limiting this run. Check RATE_LIMIT_MS.`)
    }

    // Cache the pre-filtered events so we can resume scoring if it crashes
    const cacheData = JSON.stringify(allFiltered)
    require('fs').writeFileSync(RAW_CACHE_FILE, cacheData)
    log(`💾 Cached ${allFiltered.length} events to ${RAW_CACHE_FILE}`)
  }

  if (dryRun && !scoreOnly) {
    log(`\n🏁 DRY RUN — ${stats.preFiltered} events would be scored`)
    const byCountry: Record<string, number> = {}
    for (const ev of allFiltered) {
      const c = ev._country || 'unknown'
      byCountry[c] = (byCountry[c] || 0) + 1
    }
    for (const [country, count] of Object.entries(byCountry).sort((a, b) => b[1] - a[1])) {
      log(`  ${country}: ${count}`)
    }
    return
  }

  // Phase 2: Score and insert — with parallel processing
  log(`\n🧠 Phase 2: Scoring ${allFiltered.length} pre-filtered events (${CONCURRENCY} concurrent)...`)

  const completed = await scoreAndInsert(allFiltered, stats)

  log(`\n🏁 Pipeline ${completed ? 'complete' : 'STOPPED (credits exhausted)'}!`)
  log(`  Cities: ${stats.cities}`)
  log(`  Raw events: ${stats.rawEvents}`)
  log(`  Pre-filtered: ${stats.preFiltered}`)
  log(`  AI scored: ${stats.scored}`)
  log(`  Inserted (score ≥50): ${stats.inserted}`)
  log(`  Filtered (score <50): ${stats.filtered}`)
  log(`  Errors: ${stats.errors}`)
  log(`  💰 ${costTracker.summary()}`)
}

main().catch(err => {
  if (err instanceof CostCapExceeded) {
    log(`\n🛑 ${err.message} — pipeline halted to prevent overspend.`)
    log(`  💰 ${costTracker.summary()}`)
    log(`  Raise PIPELINE_MAX_USD env var if this was expected.`)
    process.exit(2)
  }
  log(`\n❌ Pipeline crashed: ${err.message}`)
  log(`  💰 ${costTracker.summary()}`)
  console.error(err)
})
