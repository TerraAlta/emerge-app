/**
 * Eventbrite sweep for PRIORITY cities only — the cities where Emerge actually
 * has users, plus a small curated floor.
 *
 * Why not all 220 cities: at ~20 scored events per city that is ~4,300 Haiku
 * calls a run (~$3.30), which would roughly triple the monthly bill to serve
 * cities nobody has signed up from. Priority cities cost ~$0.01 each.
 *
 * Why this exists at all: Eventbrite is where the aligned Italian/Portuguese
 * content actually lives. A sample of Milan on 2026-09-13 found composting
 * workshops, two repair cafés, an agroecology talk and a denim upcycling
 * atelier — none of which any other source carries for that city.
 *
 * Where it runs: Pedro's iMac, NOT GitHub Actions. Eventbrite's CloudFront
 * refuses datacenter IPs outright — a probe from a GitHub runner on
 * 2026-10-01 got HTTP 405 + a bot challenge on 16 of 16 requests, from the
 * very first one. From a home connection the same URLs return full results.
 * That block is why the Eventbrite steps in the Sunday GitHub sweep returned
 * 0 every week. Scheduled by ~/Library/LaunchAgents/com.emerge.eventbrite-cities.plist
 * (Sundays); if the iMac is off that week, only Eventbrite is skipped.
 *
 * Rate limiting: a home IP still gets HTTP 429 if pushed (112 of ~140
 * requests at 1.5s spacing on 2026-09-13). So: the short 12-keyword
 * native-language list per city (not the ~130-keyword full list), ~4s
 * jittered spacing, and backoff on 429. 28 cities ≈ 340 requests ≈ 30 min.
 *
 * Usage:
 *   npx tsx scripts/run-city-slice.ts [--slice 0/1] [--dry-run] [--list]
 *   npx tsx scripts/run-city-slice.ts --country Portugal --deep
 *     One-off boost: every CITIES entry in that country, and with --deep the
 *     full native-language keyword list (~70) instead of the short 12.
 */
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { CITIES, type City } from '../src/pipeline/sources/cities'
import { getKeywordsForCity, getNativeKeywordsForCity } from '../src/pipeline/sources/keyword-selector'
import { extractJsonLd } from '../src/pipeline/sources/utils'
import { isPotentiallyRelevant } from '../src/pipeline/pre-filter'
import { scoreQuest } from '../src/pipeline/score-quest'
import { hasUsableStart } from '../src/pipeline/start-guard'
import { costTracker, CostCapExceeded } from '../src/pipeline/cost-cap'
import { recordRun, SLICE_CRASHED, SLICE_HALTED } from '../src/pipeline/run-log'

// ── Env ──
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1)
  }
}

// ── Args ──
const dryRun = process.argv.includes('--dry-run')
const listOnly = process.argv.includes('--list')
const deep = process.argv.includes('--deep')
const countryAt = process.argv.indexOf('--country')
const onlyCountry = countryAt !== -1 ? process.argv[countryAt + 1] : null
const flagAt = process.argv.indexOf('--slice')
const sliceArg = flagAt !== -1 ? (process.argv[flagAt + 1] ?? '') : '0/1'
const [iRaw, nRaw] = sliceArg.split('/')
const index = Number(iRaw)
const total = Number(nRaw)
if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 0 || index >= total) {
  console.error(`Bad --slice "${sliceArg}". Expected i/n with 0 <= i < n, e.g. 0/4`)
  process.exit(1)
}

/**
 * Curated floor, so the sweep still covers something sensible before Emerge
 * has users in a place. Kept deliberately short — every city here costs money
 * every week.
 */
const CORE_CITY_NAMES = ['Lisbon', 'Porto', 'London', 'Milan', 'Amsterdam', 'Berlin']

/** Cities within this distance of a user count as "theirs". */
const USER_CITY_RADIUS_KM = 75

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const la1 = aLat * Math.PI / 180
  const la2 = bLat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Priority cities = the curated floor, plus every pipeline city near a real
 * user. This grows by itself: someone signing up in Valencia puts Valencia in
 * next Sunday's sweep, without a code change.
 */
async function getPriorityCities(db: any): Promise<City[]> {
  const picked = new Map<string, City>()
  for (const name of CORE_CITY_NAMES) {
    const c = CITIES.find(x => x.name === name)
    if (c) picked.set(c.name, c)
    else console.warn(`[city-slice] CORE_CITY_NAMES has "${name}" which is not in CITIES`)
  }

  if (db) {
    const { data, error } = await db
      .from('profiles')
      .select('saved_lat, saved_lng')
      .not('saved_lat', 'is', null)
      .not('saved_lng', 'is', null)
    if (error) {
      console.warn(`[city-slice] could not read user locations (${error.message}) — using curated list only`)
    } else {
      for (const u of data ?? []) {
        for (const c of CITIES) {
          if (haversineKm(u.saved_lat, u.saved_lng, c.lat, c.lng) <= USER_CITY_RADIUS_KM) {
            picked.set(c.name, c)
          }
        }
      }
    }
  }
  return [...picked.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ── Throttle-aware fetching ──
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const FETCH_TIMEOUT = 15_000
const BASE_DELAY_MS = 4_000
const MAX_429_RETRIES = 3

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** Jitter so we never hammer on a fixed cadence, which is easy to fingerprint. */
const jitter = (ms: number) => ms * (0.6 + Math.random() * 0.8)

const stats = { requests: 0, ok: 0, rateLimited: 0, otherFail: 0, retriesSpent: 0 }

function countrySlug(country: string): string {
  return country.toLowerCase().replace(/\s+/g, '-')
}

async function fetchSearch(city: City, keyword: string): Promise<any[]> {
  const url = `https://www.eventbrite.com/d/${countrySlug(city.country)}--${encodeURIComponent(city.name)}/${encodeURIComponent(keyword)}/?page=1`

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    stats.requests++
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      })

      if (res.status === 429) {
        stats.rateLimited++
        if (attempt === MAX_429_RETRIES) return []
        // Respect Retry-After when given, else exponential backoff.
        const retryAfter = Number(res.headers.get('retry-after'))
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : jitter(BASE_DELAY_MS * Math.pow(3, attempt + 1))
        stats.retriesSpent++
        await sleep(Math.min(waitMs, 120_000))
        continue
      }

      if (!res.ok) { stats.otherFail++; return [] }
      stats.ok++
      return extractJsonLd(await res.text(), 'eventbrite')
    } catch {
      stats.otherFail++
      return []
    }
  }
  return []
}

async function main() {
  const cap = (parseFloat(process.env.CITY_MAX_USD ?? '') || 2) / total
  costTracker.reset(cap)

  const haveCreds = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  const db = haveCreds
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    : null

  const priority = onlyCountry
    ? CITIES.filter(c => c.country.toLowerCase() === onlyCountry.toLowerCase())
    : await getPriorityCities(db)
  if (onlyCountry && priority.length === 0) {
    console.error(`No cities in CITIES for country "${onlyCountry}"`)
    process.exit(1)
  }
  const mine = priority.filter((_, i) => i % total === index)

  if (listOnly) {
    console.log(`slice ${index}/${total}: ${mine.length} of ${priority.length} priority cities`)
    for (const c of mine) console.log(`  ${c.name}, ${c.country}`)
    return
  }

  if (!haveCreds || !process.env.ANTHROPIC_API_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY')
    process.exit(1)
  }

  const started = Date.now()
  const tag = `[city-slice ${index + 1}/${total}]`
  console.log(`${tag} ${mine.length} cities, budget $${cap.toFixed(2)}${dryRun ? ' (DRY RUN)' : ''}`)
  console.log(`${tag} cities: ${mine.map(c => c.name).join(', ')}`)

  const seen = new Set<string>()
  let raw = 0, relevant = 0, inserted = 0, duplicates = 0, filtered = 0, noDate = 0, errors = 0

  for (const city of mine) {
    let cityRaw = 0
    const candidates: any[] = []

    for (const keyword of (deep ? getNativeKeywordsForCity(city) : getKeywordsForCity(city))) {
      const events = await fetchSearch(city, keyword)
      for (const ev of events) {
        const key = ev.source_url || `${ev.title}|${ev.starts_at}`
        if (seen.has(key)) continue
        seen.add(key)
        raw++; cityRaw++
        if (!hasUsableStart(ev)) { noDate++; continue } // see start-guard.ts
        // Eventbrite is an open catalogue — pre-filter before any Claude call.
        if (isPotentiallyRelevant(ev)) candidates.push({ ...ev, _city: city })
      }
      await sleep(jitter(BASE_DELAY_MS))
    }

    relevant += candidates.length
    console.log(`${tag} ${city.name}: ${cityRaw} raw → ${candidates.length} relevant`)

    for (const ev of candidates) {
      try {
        // Already stored from an earlier week — don't pay to score it again.
        if (ev.source_url) {
          const { data } = await db!.from('quests').select('id').eq('source_url', ev.source_url).limit(1)
          if (data && data.length > 0) { duplicates++; continue }
        }

        const scored = await scoreQuest({
          title: ev.title,
          description: ev.description || '',
          location: ev.location_name || city.name,
        })
        if (!scored) { errors++; continue }
        if (scored.ai_score < 50) { filtered++; continue }
        if (dryRun) { inserted++; console.log(`${tag}   [${scored.ai_score}] ${scored.category} — ${ev.title.slice(0, 60)}`); continue }

        const { error } = await db!.from('quests').upsert({
          title: ev.title,
          description: ev.description || '',
          category: scored.category,
          geog: `POINT(${ev.lng || city.lng} ${ev.lat || city.lat})`,
          address: ev.location_name || city.name,
          starts_at: ev.starts_at,
          ends_at: ev.ends_at ?? null,
          source_url: ev.source_url || '',
          source_name: 'eventbrite-priority',
          ai_score: scored.ai_score,
          ai_reasoning: scored.ai_reasoning,
          image_url: ev.image_url ?? null,
        }, { onConflict: 'title,starts_at' })

        if (error) { errors++ } else {
          inserted++
          console.log(`${tag}   [${scored.ai_score}] ${scored.category} — ${ev.title.slice(0, 60)}`)
        }
      } catch (err) {
        if (err instanceof CostCapExceeded) throw err
        errors++
      }
    }
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1)
  console.log(`${tag} done in ${mins}m — ${raw} raw, ${relevant} relevant, ${inserted} inserted, ${duplicates} already stored, ${filtered} below threshold, ${noDate} without a real upcoming date, ${errors} errors`)
  console.log(`${tag} requests: ${stats.requests} (${stats.ok} ok, ${stats.rateLimited} rate-limited, ${stats.otherFail} failed, ${stats.retriesSpent} backoffs)`)
  console.log(`${tag} ${costTracker.summary()}`)
  if (!dryRun) {
    await recordRun(db, `city ${index + 1}/${total}`, [{
      source: 'eventbrite-priority', fetched: raw, alreadyStored: duplicates,
      inserted, filtered: filtered + noDate + (raw - relevant), errors,
    }], costTracker.totalUsd)
  }

  // The old failure mode was looking healthy while returning nothing. Say it loudly.
  const limitRate = stats.requests ? stats.rateLimited / stats.requests : 0
  if (limitRate > 0.3) {
    console.log(`${tag} WARNING: ${(limitRate * 100).toFixed(0)}% of requests were rate-limited — raise BASE_DELAY_MS or cut keywords.`)
  }
}

main().catch(async err => {
  const halted = err instanceof CostCapExceeded
  if (!dryRun && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    await recordRun(db, `city ${index + 1}/${total}`, [], costTracker.totalUsd, halted ? SLICE_HALTED : SLICE_CRASHED)
  }
  if (halted) {
    console.log(`[city-slice ${index + 1}/${total}] HALTED: ${err.message}`)
    console.log(costTracker.summary())
    process.exit(2)
  }
  console.error(`[city-slice ${index + 1}/${total}] CRASHED: ${err?.message ?? err}`)
  process.exit(1)
})
