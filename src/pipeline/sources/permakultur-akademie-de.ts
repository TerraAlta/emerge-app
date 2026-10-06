/**
 * Permakultur Akademie / Permakultur Institut e.V. — permakultur.de
 * Germany's main permaculture education body (the old permakultur-akademie.de
 * domain now redirects to permakultur.de). PDCs, introductory courses,
 * Lernort seminars, network meetings.
 *
 * permakultur.de runs The Events Calendar, so we read its REST API:
 *   https://permakultur.de/wp-json/tribe/events/v1/events?start_date=…&per_page=50
 * Venues carry geo_lat/geo_lng. Online courses (no venue, or "Online" in the
 * title) are skipped; events whose venue is a list (multi-location trainings)
 * use the first venue. utc_start_date is used directly.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'permakultur-akademie-de'
const API = 'https://permakultur.de/wp-json/tribe/events/v1/events'
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_EVENTS = 200
const MAX_PAGES = 6

interface Venue {
  venue?: string; address?: string; city?: string; zip?: string; stateprovince?: string; country?: string
  geo_lat?: number | string; geo_lng?: number | string
}
interface TribeEvent {
  id: number; url?: string; title?: string; description?: string; excerpt?: string
  utc_start_date?: string; utc_end_date?: string; all_day?: boolean
  cost?: string; image?: { url?: string } | false
  venue?: Venue | Venue[] | []
  organizer?: Array<{ organizer?: string }> | []
}

const utcIso = (s?: string) => (s && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? new Date(s.replace(' ', 'T') + 'Z') : null)

export const permakulturAkademieDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const today = new Date().toISOString().slice(0, 10)
    const all: TribeEvent[] = []
    let next: string | null = `${API}?per_page=50&start_date=${today}`
    for (let p = 0; next && p < MAX_PAGES; p++) {
      try {
        const res: Response = await fetch(next, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(20000),
        })
        if (!res.ok) break
        const data = await res.json()
        all.push(...(data.events ?? []))
        next = data.next_rest_url ?? null
      } catch {
        break
      }
    }

    const now = Date.now()
    const events: RawEvent[] = []
    for (const e of all) {
      const title = stripHtml(e.title ?? '')
      const start = utcIso(e.utc_start_date)
      if (!title || !start || start.getTime() < now + 3600_000) continue
      if (/\b(online|webinar|zoom|digital)/i.test(title)) continue
      const v: Venue | undefined = Array.isArray(e.venue) ? e.venue[0] : e.venue || undefined
      const lat = Number(v?.geo_lat), lng = Number(v?.geo_lng)
      if (!v || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue
      if (/online/i.test(v.venue ?? '')) continue
      const end = utcIso(e.utc_end_date)
      const place = [v.venue, [v.zip, v.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      const org = Array.isArray(e.organizer) ? e.organizer.map((o) => stripHtml(o.organizer ?? '')).filter(Boolean).join(', ') : ''
      const desc = stripHtml(e.excerpt || e.description || '').slice(0, 700)
      events.push({
        source: SRC,
        source_id: `pka-${e.id}`,
        source_url: e.url ?? 'https://permakultur.de/kurse/',
        title,
        description: [desc, Array.isArray(e.venue) && e.venue.length > 1 ? `Mehrere Lernorte (u. a. ${e.venue.map((x) => x.venue).filter(Boolean).slice(0, 4).join(', ')}).` : ''].filter(Boolean).join(' '),
        organizer: org || 'Permakultur Institut e.V.',
        location_name: place || 'Deutschland',
        lat,
        lng,
        starts_at: start.toISOString(),
        ends_at: end && end > start ? end.toISOString() : null,
        cost: stripHtml(e.cost ?? '') || 'Siehe Kursseite',
        image_url: e.image && e.image.url ? e.image.url : null,
      })
    }
    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return events.slice(0, MAX_EVENTS)
  },
}
