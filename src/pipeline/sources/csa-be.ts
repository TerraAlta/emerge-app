/**
 * CSA Netwerk Vlaanderen — csa-netwerk.be
 * Flemish community-supported-agriculture network: CSA conference, open
 * farm days, info sessions, regional learning networks.
 *
 * The site is Squarespace; /kalender is a BLOG collection (not a Squarespace
 * events collection), so items have no start date — only a publish date —
 * and every item carries the same default location (the network's office).
 * Real activities put the date in the TITLE: "Zaterdag 21 november > CSA
 * conferentie 2026 in Track, Brussel", "Klimaatmars 11 oktober 2026 14u
 * Brussel Noord". We read the collection JSON (?format=json, one request),
 * keep items whose title contains a day + month, take the year from the
 * title or the first occurrence on/after publication, the hour from "14u" /
 * "14:00" (else 10:00 local), and the place from the title text after
 * " in " or after the date/time, geocoded (cached). Items without a
 * resolvable place are skipped.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities } from './utils'
import { getJson, parisIso, geocodeFrFirst, ONLINE_RE, UA } from './fr-common'

const SRC = 'csa-be'
const BASE = 'https://www.csa-netwerk.be'
const FEED = `${BASE}/kalender?format=json`

const NL_MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7, augustus: 8,
  september: 9, oktober: 10, november: 11, december: 12,
}
const MONTH_RE = new RegExp(`(\\d{1,2})\\s+(${Object.keys(NL_MONTHS).join('|')})(?:\\s+(20\\d{2}))?`, 'i')

// Nominatim in Dutch, Belgium only (fr-common's geocoder asks in French and
// rejects hits whose town name is not in the query — "Brussel" ≠ "Bruxelles").
// ≥1.1 s between calls, cached, backs off on 429, then falls back to fr-common.
const nlCache = new Map<string, { lat: number; lng: number } | null>()
let lastNl = 0
async function nominatimNl(q: string): Promise<{ lat: number; lng: number } | null> {
  if (nlCache.has(q)) return nlCache.get(q)!
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastNl + 1100 + attempt * 5000 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastNl = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=be&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'nl' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) continue
      if (!res.ok) break
      const d = await res.json()
      const out = d[0] ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) } : null
      nlCache.set(q, out)
      return out
    } catch { /* retry */ }
  }
  return null
}

/** Geocode Belgian (Dutch-language) places: first hit of the queries. */
export async function geocodeBeNl(queries: string[]): Promise<{ lat: number; lng: number } | null> {
  for (const q of queries) {
    if (!q.trim()) continue
    const r = await nominatimNl(q.trim())
    if (r && r.lat > 49.4 && r.lat < 51.6 && r.lng > 2.5 && r.lng < 6.5) return r
  }
  return geocodeFrFirst(queries)
}

export const csaBe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const data = await getJson<any>(FEED, 20000)
    const items: any[] = Array.isArray(data?.items) ? data.items : []
    const now = Date.now()
    const events: RawEvent[] = []
    for (const it of items) {
      const title = decodeEntities(stripHtml(String(it.title ?? ''))).trim()
      const dm = title.match(MONTH_RE)
      if (!dm) continue
      const d = +dm[1]
      const m = NL_MONTHS[dm[2].toLowerCase()]
      const pub = Number(it.publishOn) || Date.parse(it.publishOn)
      let y = dm[3] ? +dm[3] : new Date(pub || now).getUTCFullYear()
      if (!dm[3] && pub && Date.UTC(y, m - 1, d) < pub - 86400000) y++
      // the year may also appear elsewhere in the title ("CSA conferentie 2026")
      if (!dm[3]) {
        const ty = title.match(/\b(20\d{2})\b/)
        if (ty && Math.abs(+ty[1] - y) === 1) y = +ty[1]
      }

      const after = title.slice((dm.index ?? 0) + dm[0].length)
      const hm = after.match(/^\s*(\d{1,2})(?:u|h|:)(\d{2})?/i)
      const start = parisIso(y, m, d, hm ? +hm[1] : 10, hm ? +(hm[2] ?? 0) : 0)
      if (!start || Date.parse(start) < now) continue

      // Place: "… in Track, Brussel" or text right after the date/time
      const inPart = title.match(/\sin\s+([^>]+)$/i)?.[1]?.trim()
      const tail = after.replace(/^\s*(\d{1,2}(?:u|h|:)(\d{2})?)?/i, '').replace(/^[\s>–-]+/, '').trim()
      const place = inPart || (tail && tail.split(/\s+/).length <= 4 ? tail : '')
      if (!place || ONLINE_RE.test(`${title} ${place}`)) continue
      const parts = place.split(',').map((s) => s.trim()).filter(Boolean)
      const geo = await geocodeBeNl([
        `${place}, België`,
        parts.length > 1 ? `${parts[parts.length - 1]}, België` : '',
        `${place.split(/\s+/)[0]}, België`,
      ].filter(Boolean))
      if (!geo) continue

      const body = stripHtml(String(it.body ?? '').replace(/<style[\s\S]*?<\/style>/gi, ''))
        .replace(/#block-[\w-]+\s*\{[^}]*\}/g, '').replace(/@media[^{]*\{[^}]*\{[^}]*\}\s*\}/g, '').replace(/\s+/g, ' ').trim()
      const excerpt = stripHtml(String(it.excerpt ?? ''))
      const cleanTitle = title.replace(/^(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\s+\d{1,2}\s+[a-z]+\s*>\s*/i, '').trim()
      events.push({
        source: SRC,
        source_id: `csa-be-${it.id ?? it.urlId}`,
        source_url: it.fullUrl ? `${BASE}${it.fullUrl}` : `${BASE}/kalender`,
        title: cleanTitle || title,
        description: (excerpt || body).slice(0, 600) || 'Activiteit van het CSA-netwerk Vlaanderen.',
        organizer: 'CSA Netwerk Vlaanderen',
        location_name: place,
        lat: geo.lat, lng: geo.lng,
        starts_at: start,
        ends_at: null,
        cost: 'Zie website',
        image_url: it.assetUrl ?? null,
      })
    }
    return events
  },
}
