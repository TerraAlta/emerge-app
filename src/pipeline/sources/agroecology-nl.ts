/**
 * Agroecologie Netwerk — agroecologie.nl
 * Dutch agroecology movement (farmers, activists, researchers): network days,
 * conferences, field trips, festival (Rooting Deeper), working groups.
 *
 * The old URL (agroecologypartnership.eu) is the EU research partnership, not
 * this network. agroecologie.nl runs The Events Calendar, so we read
 * /wp-json/tribe/events/v1/events (upcoming only). Venues have no geo, so the
 * venue address is geocoded with Nominatim (≥1.1 s apart, cached); events
 * without a placeable venue, online events and all-day events without a time
 * are skipped. The calendar is sparse (a handful of events a year).
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'agroecology-nl'
const ORG = 'Agroecologie Netwerk'
const API = 'https://agroecologie.nl/wp-json/tribe/events/v1/events'
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'

interface TribeVenue { venue?: string; address?: string; zip?: string; city?: string; country?: string; geo_lat?: number | string; geo_lng?: number | string }
interface TribeEvent {
  id: number; url?: string; title?: string; description?: string; excerpt?: string
  all_day?: boolean; utc_start_date?: string; utc_end_date?: string
  venue?: TribeVenue | unknown[]; cost?: string; image?: { url?: string } | false
}

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastNominatim = 0
async function nominatim(q: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache.has(q)) return geoCache.get(q)!
  const wait = lastNominatim + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastNominatim = Date.now()
  let out: { lat: number; lng: number } | null = null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': UA, 'Accept-Language': 'nl' }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      if (d[0]) out = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
    }
  } catch { /* none */ }
  if (out && !(out.lat > 35 && out.lat < 72 && out.lng > -25 && out.lng < 45)) out = null
  geoCache.set(q, out)
  return out
}

async function placeVenue(v: TribeVenue): Promise<{ lat: number; lng: number } | null> {
  const lat = Number(v.geo_lat)
  const lng = Number(v.geo_lng)
  if (lat && lng && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
  const city = v.city?.trim() ?? ''
  const queries = [
    [v.address, [v.zip, city].filter(Boolean).join(' '), v.country].filter(Boolean).join(', '),
    [v.venue, city].filter(Boolean).join(', '),
    city,
  ]
  for (const q of [...new Set(queries)].filter((q) => q.length > 2)) {
    const g = await nominatim(q)
    if (g) return g
  }
  return null
}

export const agroecologyNl: SourceFetcher = {
  name: SRC,
  async fetch() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
    const all: TribeEvent[] = []
    for (let page = 1; page <= 3; page++) {
      try {
        const res = await fetch(`${API}?per_page=50&page=${page}&start_date=${today}`, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(20000),
        })
        if (!res.ok) break
        const data = await res.json() as { events?: TribeEvent[]; total_pages?: number }
        all.push(...(data.events ?? []))
        if (!data.total_pages || page >= data.total_pages) break
      } catch {
        break
      }
    }

    const now = Date.now()
    const events: RawEvent[] = []
    for (const e of all) {
      const title = stripHtml(e.title ?? '')
      const v = (e.venue && !Array.isArray(e.venue) ? e.venue : null) as TribeVenue | null
      if (!title || !v || e.all_day || !e.utc_start_date) continue
      const start = new Date(e.utc_start_date.replace(' ', 'T') + 'Z')
      if (isNaN(start.getTime()) || start.getTime() < now + 3600_000) continue
      const desc = stripHtml(e.description ?? e.excerpt ?? '')
      if (/\b(online|webinar|zoom|livestream)\b/i.test(`${title} ${v.venue ?? ''}`)) continue
      const geo = await placeVenue(v)
      if (!geo) continue
      const end = e.utc_end_date ? new Date(e.utc_end_date.replace(' ', 'T') + 'Z') : null
      events.push({
        source: SRC,
        source_id: `ae-${e.id}`,
        source_url: e.url ?? 'https://agroecologie.nl/events/',
        title,
        description: desc.slice(0, 500) || `${ORG} bijeenkomst.`,
        organizer: ORG,
        location_name: [v.venue, v.address, v.city].filter(Boolean).join(', ').slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: start.toISOString(),
        ends_at: end && !isNaN(end.getTime()) && end > start ? end.toISOString() : null,
        cost: stripHtml(e.cost ?? '') || 'Zie website',
        image_url: e.image && e.image.url ? e.image.url : null,
      })
    }
    return events
  },
}
