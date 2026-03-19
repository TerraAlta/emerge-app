/**
 * Rezero — rezero.cat
 * Catalan/Spanish zero waste foundation events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://rezero.cat'
const URLS = [`${BASE}/eventos/`, `${BASE}/agenda/`, `${BASE}/esdeveniments/`]
const DEF_LAT = 41.3874, DEF_LNG = 2.1686
const ES_MO: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
  septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11, gener: 0, febrer: 1,
  'març': 2, marc: 2, maig: 4, juny: 5, juliol: 6, agost: 7, setembre: 8, desembre: 11,
}

function parseEsCat(s: string): string {
  const m = s.match(/(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})/i)
  if (m) { const mo = ES_MO[m[2].toLowerCase()]; if (mo !== undefined) return new Date(+m[3], mo, +m[1]).toISOString() }
  const d = s.match(/datetime="([^"]*)"/)
  if (d) return new Date(d[1]).toISOString()
  const n = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (n) return new Date(+n[3], +n[2] - 1, +n[1]).toISOString()
  return new Date().toISOString()
}

export const rezeroEs: SourceFetcher = {
  name: 'rezero-es',
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
                source: 'rezero-es', source_id: `rz-${e.id}`,
                source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? 'Rezero',
                location_name: e.venue?.venue ?? e.venue?.city ?? 'Barcelona',
                lat: parseFloat(e.venue?.geo_lat ?? '0') || DEF_LAT,
                lng: parseFloat(e.venue?.geo_lng ?? '0') || DEF_LNG,
                starts_at: new Date(e.start_date).toISOString(),
                ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
                cost: e.cost ?? 'Ver evento',
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
        const jsonLd = extractJsonLd(html, 'rezero-es')
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
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|evento|esdeveniment|taller|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'rezero-es', source_id: `rz-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'Rezero event. See link for details.',
      organizer: 'Rezero', location_name: 'Barcelona',
      lat: DEF_LAT, lng: DEF_LNG, starts_at: parseEsCat(block), cost: 'Ver evento',
    })
  }
  return events
}
