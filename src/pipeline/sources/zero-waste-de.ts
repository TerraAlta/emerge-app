/**
 * Zero Waste Germany — zerowastegermany.de
 * German zero waste network events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://zerowastegermany.de'
const URLS = [`${BASE}/veranstaltungen/`, `${BASE}/events/`]
const DEF_LAT = 52.5200, DEF_LNG = 13.4050
const DE_MO: Record<string, number> = {
  januar: 0, februar: 1, 'märz': 2, maerz: 2, april: 3, mai: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
}

function parseDe(s: string): string {
  const m = s.match(/(\d{1,2})\.?\s+(\w+)\s+(\d{4})/i)
  if (m) { const mo = DE_MO[m[2].toLowerCase()]; if (mo !== undefined) return new Date(+m[3], mo, +m[1]).toISOString() }
  const d = s.match(/datetime="([^"]*)"/)
  if (d) return new Date(d[1]).toISOString()
  const n = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (n) return new Date(+n[3], +n[2] - 1, +n[1]).toISOString()
  return new Date().toISOString()
}

export const zeroWasteDe: SourceFetcher = {
  name: 'zero-waste-de',
  async fetch() {
    for (const url of URLS) {
      try {
        try {
          const api = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (api.ok) {
            const data = await api.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any): RawEvent => ({
                source: 'zero-waste-de', source_id: `zwd-${e.id}`,
                source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? 'Zero Waste Germany',
                location_name: e.venue?.venue ?? e.venue?.city ?? 'Deutschland',
                lat: parseFloat(e.venue?.geo_lat ?? '0') || DEF_LAT,
                lng: parseFloat(e.venue?.geo_lng ?? '0') || DEF_LNG,
                starts_at: new Date(e.start_date).toISOString(),
                ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
                cost: e.cost ?? 'Siehe Veranstaltung',
              }))
            }
          }
        } catch {}

        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()
        const jsonLd = extractJsonLd(html, 'zero-waste-de')
        if (jsonLd.length > 0) return jsonLd
        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|veranstaltung|workshop|aktion|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'zero-waste-de', source_id: `zwd-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'Zero Waste Germany Veranstaltung. Siehe Link.',
      organizer: 'Zero Waste Germany', location_name: 'Deutschland',
      lat: DEF_LAT, lng: DEF_LNG, starts_at: parseDe(block), cost: 'Siehe Veranstaltung',
    })
  }
  return events
}
