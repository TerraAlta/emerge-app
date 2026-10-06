/**
 * Permaculture Action Network — permacultureaction.org
 * Organizes permaculture action days at music festivals and communities.
 *
 * The site runs The Events Calendar, so we read its REST API
 * (/wp-json/tribe/events/v1/events), which returns only upcoming events by
 * default and gives local start/end, the event time zone and venue coordinates.
 *
 * Note (2026-10): the calendar has been quiet since mid-2023 (last event
 * June 2023), so this usually returns nothing — but it is a real feed and
 * will pick up new action days if they post them.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'permaculture-action-usa'
const API = 'https://www.permacultureaction.org/wp-json/tribe/events/v1/events'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0; +https://emerge.terralta.org)'
const NOMINATIM_UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_PAGES = 5
const MAX_EVENTS = 200

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15000) },
    )
    if (!res.ok) return null
    const d = await res.json()
    return d[0] ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) } : null
  } catch {
    return null
  }
}

// Some older events carry a bogus "UTC-12" zone (and a utc_* time equal to
// local time); for those we fall back to the venue state's zone.
const STATE_TZ: Record<string, string> = {
  CA: 'America/Los_Angeles', OR: 'America/Los_Angeles', WA: 'America/Los_Angeles', NV: 'America/Los_Angeles',
  CO: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver', MT: 'America/Denver', WY: 'America/Denver',
  ID: 'America/Boise', AZ: 'America/Phoenix',
  TX: 'America/Chicago', OK: 'America/Chicago', KS: 'America/Chicago', NE: 'America/Chicago', MN: 'America/Chicago',
  IA: 'America/Chicago', MO: 'America/Chicago', AR: 'America/Chicago', LA: 'America/Chicago', MS: 'America/Chicago',
  AL: 'America/Chicago', TN: 'America/Chicago', WI: 'America/Chicago', IL: 'America/Chicago', SD: 'America/Chicago', ND: 'America/Chicago',
  NY: 'America/New_York', NJ: 'America/New_York', PA: 'America/New_York', MA: 'America/New_York', CT: 'America/New_York',
  RI: 'America/New_York', VT: 'America/New_York', NH: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York',
  DE: 'America/New_York', DC: 'America/New_York', VA: 'America/New_York', WV: 'America/New_York', NC: 'America/New_York',
  SC: 'America/New_York', GA: 'America/New_York', FL: 'America/New_York', OH: 'America/New_York', MI: 'America/New_York',
  IN: 'America/Indiana/Indianapolis', KY: 'America/New_York',
  HI: 'Pacific/Honolulu', AK: 'America/Anchorage',
}

function tzOffsetMin(ts: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** "2026-11-07 10:00:00" in zone tz → UTC ISO */
function zonedIso(s: unknown, tz: string): string | null {
  if (typeof s !== 'string') return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  try {
    return new Date(guess - tzOffsetMin(guess, tz) * 60000).toISOString()
  } catch {
    return null
  }
}

export const permacultureActionUsa: SourceFetcher = {
  name: SRC,
  async fetch() {
    const events: RawEvent[] = []
    const geoCache = new Map<string, { lat: number; lng: number } | null>()

    for (let page = 1; page <= MAX_PAGES && events.length < MAX_EVENTS; page++) {
      let data: any
      try {
        const res = await fetch(`${API}?per_page=50&page=${page}`, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(20000),
        })
        if (!res.ok) break
        data = await res.json()
      } catch (err) {
        console.warn(`[${SRC}] API failed:`, (err as Error).message)
        break
      }
      const list: any[] = Array.isArray(data?.events) ? data.events : []
      if (list.length === 0) break

      for (const e of list) {
        const title = stripHtml(e.title ?? '')
        if (!title) continue
        const venue = e.venue && !Array.isArray(e.venue) ? e.venue : {}
        const tz = typeof e.timezone === 'string' && e.timezone.includes('/')
          ? e.timezone
          : STATE_TZ[String(venue.stateprovince ?? venue.state ?? '').toUpperCase()]
        if (!tz) continue
        const startsAt = zonedIso(e.start_date, tz)
        if (!startsAt) continue
        const addr = [venue.venue, venue.address, venue.city, venue.stateprovince ?? venue.state, venue.country]
          .filter((x: unknown) => typeof x === 'string' && x.trim())
          .join(', ')
        const text = `${title} ${addr} ${stripHtml(e.description ?? '')}`
        if (/\b(online|virtual|webinar|zoom)\b/i.test(`${title} ${addr}`) || (!addr && /\bzoom\b/i.test(text))) continue

        let lat = parseFloat(venue.geo_lat)
        let lng = parseFloat(venue.geo_lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
          if (!addr) continue
          if (!geoCache.has(addr)) {
            if (geoCache.size > 0) await sleep(1100)
            geoCache.set(addr, await geocode(addr))
          }
          const g = geoCache.get(addr)
          if (!g) continue
          lat = g.lat
          lng = g.lng
        }

        events.push({
          source: SRC,
          source_id: `pan-${e.id}`,
          source_url: e.url ?? null,
          title,
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: stripHtml(e.organizer?.[0]?.organizer ?? '') || 'Permaculture Action Network',
          location_name: addr || 'See event page',
          lat,
          lng,
          starts_at: startsAt,
          ends_at: zonedIso(e.end_date, tz),
          cost: stripHtml(e.cost ?? '') || 'See event page',
          image_url: e.image?.url ?? null,
        })
      }
      if (!data.next_rest_url) break
    }
    return events.slice(0, MAX_EVENTS)
  },
}
