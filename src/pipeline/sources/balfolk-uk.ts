/**
 * Balfolk UK — community folk dance (bals and workshops) across the UK.
 *
 * balfolk.co.uk no longer resolves. UK balfolk events are maintained in the
 * open folkdance.page / balfolk.org listing (the "dancelist" project), which
 * publishes a JSON feed: /index.json?country=UK&styles=balfolk — future events
 * only, with ISO start/end (or all-day start_date/end_date), city, price,
 * organiser, bands and links.
 *
 * The feed gives a city but no coordinates; each distinct city is geocoded
 * once via postcodes.io /places (free, keyless). Events whose city can't be
 * placed are skipped.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'balfolk-uk'
const FEED = 'https://folkdance.page/index.json?country=UK&styles=balfolk'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
const MAX_GEOCODES = 22

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
}

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
    return r.ok ? await r.json() : null
  } catch { return null }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

async function geocodePlace(city: string): Promise<{ lat: number; lng: number } | null> {
  const d = await getJson(`https://api.postcodes.io/places?q=${encodeURIComponent(city)}&limit=10`)
  const results: any[] = d?.result ?? []
  if (!results.length) return null
  const want = norm(city)
  const rank = (r: any) => {
    const exact = norm(r.name_1 ?? '') === want || norm(r.name_2 ?? '') === want ? 0 : 10
    const type = ({ City: 0, Town: 1, Village: 2, Hamlet: 3, 'Suburban Area': 4 } as Record<string, number>)[r.local_type] ?? 5
    return exact + type
  }
  const best = results.slice().sort((a, b) => rank(a) - rank(b))[0]
  const lat = Number(best.latitude), lng = Number(best.longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null
}

export const balfolkUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    const data = await getJson(FEED)
    const list: DanceEvent[] = Array.isArray(data?.events) ? data.events : []

    const geo = new Map<string, { lat: number; lng: number } | null>()
    const events: RawEvent[] = []

    for (const e of list) {
      if (!e.name || e.online) continue
      if (e.country && e.country !== 'UK') continue
      const city = (e.city ?? '').trim()
      if (!city) continue

      // Timed events carry an offset (ISO); all-day ones only a date.
      let starts: Date | null = null
      let ends: Date | null = null
      if (e.start) starts = new Date(e.start)
      else if (e.start_date) starts = new Date(`${e.start_date}T12:00:00Z`)
      if (!starts || isNaN(starts.getTime())) continue
      if (e.end) ends = new Date(e.end)
      else if (e.end_date) ends = new Date(`${e.end_date}T18:00:00Z`)
      if (ends && isNaN(ends.getTime())) ends = null

      if (!geo.has(city)) {
        if (geo.size >= MAX_GEOCODES) continue
        geo.set(city, await geocodePlace(city))
      }
      const loc = geo.get(city)
      if (!loc) continue

      const bits: string[] = []
      if (e.details) bits.push(stripHtml(e.details))
      const kind = [e.workshop ? 'workshop' : '', e.social ? 'social dance (bal)' : ''].filter(Boolean).join(' + ')
      bits.push(`Balfolk ${kind || 'event'} in ${city}. Dance styles: ${(e.styles ?? ['balfolk']).join(', ')}.`)
      if (e.bands?.length) bits.push(`Bands: ${e.bands.join(', ')}.`)
      if (e.callers?.length) bits.push(`Callers: ${e.callers.join(', ')}.`)

      const startIso = starts.toISOString()
      events.push({
        source: SRC,
        source_id: `bfuk-${hashStr(e.name + startIso + city)}`,
        source_url: e.links?.[0] ?? 'https://folkdance.page/?country=UK&styles=balfolk',
        title: e.name,
        description: bits.join(' ').slice(0, 500),
        organizer: e.organisation || e.name,
        location_name: `${city}, UK`,
        lat: loc.lat,
        lng: loc.lng,
        starts_at: startIso,
        ends_at: ends && ends > starts ? ends.toISOString() : null,
        cost: e.price ? (/^free$/i.test(e.price) ? 'Free' : e.price) : 'See event page',
      })
    }
    return events
  },
}
