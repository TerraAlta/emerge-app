/**
 * Energiegenossenschaften / Bürgerenergie — buendnis-buergerenergie.de
 *
 * The original domain energiegenossenschaften.de is now a parked domain
 * ("No advertisers available" redirect page), and energiegenossenschaften-
 * gruenden.de redirects to the Netzwerk Energiewende Jetzt. The shared,
 * maintained calendar for energy cooperatives / citizen energy is the
 * Bündnis Bürgerenergie e.V. event list (it also carries the Netzwerk
 * Energiewende Jetzt seminars):
 *   https://www.buendnis-buergerenergie.de/events/
 *   <div class="event_eintrag"> … <span class="zahl">02</span>
 *     <span class="monatjahr">November 2026</span> … <div class="headline">
 *     <p>Pfalzakademie, Lambrecht</p><h3>Title</h3> … <p>teaser</p> … <a href>
 * Only entries with a place are in-person (webinars have an empty place and
 * Teams/Zoom links). No start times are published on the list or detail
 * pages, so 10:00 Europe/Berlin is assumed. Places are geocoded with Nominatim.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'energiegenossenschaften-de'
const BASE = 'https://www.buendnis-buergerenergie.de'
const LIST = `${BASE}/events/`
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'

const MONTHS: Record<string, number> = {
  januar: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6, juli: 7,
  august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
}

function berlinOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}
/** Europe/Berlin wall-clock → UTC ISO (CET/CEST aware). */
function berlinIso(y: number, mo: number, d: number, h = 0, mi = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - berlinOffsetMin(guess) * 60000
  return new Date(guess - berlinOffsetMin(first) * 60000).toISOString()
}

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastGeo = 0
/** Nominatim (Germany), ≥1.1 s apart, cached, backs off on 429. */
async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  q = q.replace(/\s+/g, ' ').trim()
  if (!q) return null
  if (geoCache.has(q)) return geoCache.get(q)!
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastGeo + 1100 + attempt * 4000 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'de' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) continue
      if (!res.ok) return null
      const d = await res.json()
      const lat = parseFloat(d?.[0]?.lat), lng = parseFloat(d?.[0]?.lon)
      const out = lat > 47.2 && lat < 55.1 && lng > 5.8 && lng < 15.1 ? { lat, lng } : null
      geoCache.set(q, out)
      return out
    } catch { /* retry */ }
  }
  return null
}

export const energiegenossenschaftenDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    let html: string
    try {
      const res = await fetch(LIST, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) })
      if (!res.ok) return []
      html = await res.text()
    } catch {
      return []
    }

    const now = Date.now()
    const events: RawEvent[] = []
    for (const block of html.split('<div class="event_eintrag">').slice(1)) {
      const b = block.split(/<div class="event_trenner"/)[0]
      const day = b.match(/<span class="zahl">\s*(\d{1,2})\s*<\/span>/)?.[1]
      const my = stripHtml(b.match(/<span class="monatjahr">([\s\S]*?)<\/span>/)?.[1] ?? '').match(/([A-Za-zä]+)\s+(\d{4})/)
      const mo = my ? MONTHS[my[1].toLowerCase()] : undefined
      const title = stripHtml(b.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? '')
      const place = stripHtml(b.match(/<div class="headline">\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? '')
      if (!day || !my || !mo || !title) continue
      if (!place || /online|webinar|zoom|teams/i.test(`${place} ${title}`)) continue
      const start = berlinIso(+my[2], mo, +day, 10, 0)
      if (Date.parse(start) < now + 3600_000) continue
      const teaser = stripHtml((b.match(/<\/div>\s*<\/div>\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/&shy;/g, ''))
      const href = b.match(/<a href="([^"]+)" class="btn/)?.[1]
      const url = href ? new URL(href, BASE).toString() : LIST

      const parts = place.split(',').map((s) => s.trim())
      let pos: { lat: number; lng: number } | null = null
      for (const q of [place, parts[parts.length - 1]]) { pos = await geocode(q); if (pos) break }
      if (!pos) continue

      events.push({
        source: SRC,
        source_id: `bben-${(href ?? title).replace(/\/$/, '').split('/').pop()!.slice(0, 70)}-${start.slice(0, 10)}`,
        source_url: url,
        title,
        description: [teaser, `Ort: ${place}.`].filter(Boolean).join(' ').replace(/­/g, ''),
        organizer: 'Bündnis Bürgerenergie e.V.',
        location_name: place,
        lat: pos.lat,
        lng: pos.lng,
        starts_at: start,
        ends_at: null,
        cost: /bildungsurlaub/i.test(title) ? 'Siehe Veranstaltung (Bildungsurlaub)' : 'Siehe Veranstaltung',
      })
    }
    return events
  },
}
