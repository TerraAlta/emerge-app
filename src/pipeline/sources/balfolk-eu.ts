/**
 * Balfolk Europe — community folk dance (bals, workshops, festivals) across
 * continental Europe.
 *
 * balfolk.eu doesn't exist as a listing. European balfolk events are kept in
 * the open folkdance.page / balfolk.org listing (the "dancelist" project),
 * which publishes a JSON feed of future events: /index.json?styles=balfolk.
 * balfolk-uk.ts reads the UK slice of the same feed, so here we take every
 * other European country (Belgium, Germany, Netherlands, Czechia, Austria,
 * France, Italy, Poland, the Baltics, Spain, Switzerland…).
 *
 * Timed events carry an ISO offset; all-day ones only a date, which we place
 * at 10:00 in the country's time zone. The feed has a city but no
 * coordinates: cities are geocoded once each (Nominatim, ≤40 lookups, busiest
 * cities first). At most 25 events per city (Brussels alone lists ~90 weekly
 * classes) and 200 overall, soonest first.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getJson, geocodeEu, tzForCountry, zonedIso, COUNTRY_CC, type GeoHit } from './eu-common'

const SRC = 'balfolk-eu'
const FEED = 'https://folkdance.page/index.json?styles=balfolk'
const MAX_GEOCODES = 40
const PER_CITY = 25
const MAX_EVENTS = 200
const EXCLUDED = new Set(['gb', 'uk']) // covered by balfolk-uk

interface DanceEvent {
  name: string
  links?: string[]
  start?: string
  end?: string
  start_date?: string
  end_date?: string
  country?: string
  city?: string
  styles?: string[]
  workshop?: boolean
  social?: boolean
  bands?: string[]
  callers?: string[]
  price?: string
  organisation?: string
  details?: string
  online?: boolean
  cancelled?: boolean
}

function ymd(s: string): [number, number, number] | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? [+m[1], +m[2], +m[3]] : null
}

export const balfolkEu: SourceFetcher = {
  name: SRC,
  async fetch() {
    const data = await getJson<{ events?: DanceEvent[] }>(FEED)
    const list = Array.isArray(data?.events) ? data!.events! : []

    // Keep in-person continental-European events with a usable start
    type Cand = { e: DanceEvent; cc: string; tz: string; city: string; starts: Date; ends: Date | null }
    const cands: Cand[] = []
    for (const e of list) {
      if (!e.name || e.online || e.cancelled) continue
      const cc = COUNTRY_CC[(e.country ?? '').trim().toLowerCase()]
      if (!cc || EXCLUDED.has(cc)) continue
      const tz = tzForCountry(cc)
      const city = (e.city ?? '').trim()
      if (!tz || !city) continue

      let starts: Date | null = null
      let ends: Date | null = null
      if (e.start) starts = new Date(e.start)
      else if (e.start_date) {
        const p = ymd(e.start_date)
        const iso = p ? zonedIso(tz, p[0], p[1], p[2], 10, 0) : null
        starts = iso ? new Date(iso) : null
      }
      if (!starts || isNaN(starts.getTime())) continue
      if (e.end) ends = new Date(e.end)
      else if (e.end_date) {
        const p = ymd(e.end_date)
        const iso = p ? zonedIso(tz, p[0], p[1], p[2], 18, 0) : null
        ends = iso ? new Date(iso) : null
      }
      if (ends && (isNaN(ends.getTime()) || ends <= starts)) ends = null
      cands.push({ e, cc, tz, city, starts, ends })
    }
    cands.sort((a, b) => a.starts.getTime() - b.starts.getTime())

    // Geocode the busiest cities first, within budget
    const count = new Map<string, number>()
    for (const c of cands) count.set(`${c.cc}|${c.city}`, (count.get(`${c.cc}|${c.city}`) ?? 0) + 1)
    const cities = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_GEOCODES).map(([k]) => k)
    const geo = new Map<string, GeoHit | null>()
    for (const k of cities) {
      const [cc, city] = k.split('|')
      geo.set(k, await geocodeEu(city.replace(/\s+i\.\s*Br\.?$/, ' im Breisgau'), cc))
    }

    const perCity = new Map<string, number>()
    const events: RawEvent[] = []
    for (const { e, cc, city, starts, ends } of cands) {
      if (events.length >= MAX_EVENTS) break
      const k = `${cc}|${city}`
      const loc = geo.get(k)
      if (!loc) continue
      const n = perCity.get(k) ?? 0
      if (n >= PER_CITY) continue
      perCity.set(k, n + 1)

      const bits: string[] = []
      if (e.details) bits.push(stripHtml(e.details))
      const kind = [e.workshop ? 'workshop' : '', e.social ? 'social dance (bal)' : ''].filter(Boolean).join(' + ')
      bits.push(`Balfolk ${kind || 'event'} in ${city}. Dance styles: ${(e.styles ?? ['balfolk']).join(', ')}.`)
      if (e.bands?.length) bits.push(`Bands: ${e.bands.join(', ')}.`)
      if (e.callers?.length) bits.push(`Callers: ${e.callers.join(', ')}.`)

      const startIso = starts.toISOString()
      events.push({
        source: SRC,
        source_id: `bfeu-${hashStr(e.name + startIso + city)}`,
        source_url: e.links?.[0] ?? `https://folkdance.page/?country=${encodeURIComponent(e.country ?? '')}&styles=balfolk`,
        title: e.name,
        description: bits.join(' ').slice(0, 500),
        organizer: e.organisation || e.name,
        location_name: `${city}, ${e.country}`,
        lat: loc.lat,
        lng: loc.lng,
        starts_at: startIso,
        ends_at: ends ? ends.toISOString() : null,
        cost: e.price ? (/^free$/i.test(e.price) ? 'Free' : e.price) : 'See event page',
      })
    }
    return events
  },
}
