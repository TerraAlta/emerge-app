/**
 * Zero Waste France — zerowastefrance.org
 * French zero waste movement events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://www.zerowastefrance.org'
const URLS = [`${BASE}/agenda/`, `${BASE}/evenements/`]
const DEF_LAT = 48.8566, DEF_LNG = 2.3522
const FR_MO: Record<string, number> = {
  janvier: 0, 'février': 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, 'août': 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, 'décembre': 11, decembre: 11,
}

function parseFr(s: string): string {
  const m = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i)
  if (m) { const mo = FR_MO[m[2].toLowerCase()]; if (mo !== undefined) return new Date(+m[3], mo, +m[1]).toISOString() }
  const d = s.match(/datetime="([^"]*)"/)
  if (d) return new Date(d[1]).toISOString()
  const n = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (n) return new Date(+n[3], +n[2] - 1, +n[1]).toISOString()
  return new Date().toISOString()
}

export const zeroWasteFr: SourceFetcher = {
  name: 'zero-waste-fr',
  async fetch(opts: { lat: number; lng: number; radiusKm: number }) {
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
                source: 'zero-waste-fr', source_id: `zwf-${e.id}`,
                source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? 'Zero Waste France',
                location_name: e.venue?.venue ?? e.venue?.city ?? 'France',
                lat: parseFloat(e.venue?.geo_lat ?? '0') || DEF_LAT,
                lng: parseFloat(e.venue?.geo_lng ?? '0') || DEF_LNG,
                starts_at: new Date(e.start_date).toISOString(),
                ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
                cost: e.cost ?? 'Voir événement',
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
        const jsonLd = extractJsonLd(html, 'zero-waste-fr')
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
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|agenda|atelier|action|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'zero-waste-fr', source_id: `zwf-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'Zero Waste France événement. Voir le lien.',
      organizer: 'Zero Waste France', location_name: 'France',
      lat: DEF_LAT, lng: DEF_LNG, starts_at: parseFr(block), cost: 'Voir événement',
    })
  }
  return events
}
