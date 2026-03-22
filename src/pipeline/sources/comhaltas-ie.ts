/** Comhaltas Ceoltóirí Éireann — comhaltas.ie — traditional Irish music community events */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://comhaltas.ie/events/',
  'https://www.comhaltas.ie/events/',
  'https://comhaltas.ie/whatson/',
]

export const comhaltasIe: SourceFetcher = {
  name: 'comhaltas-ie',
  async fetch() {
    // Try WordPress REST API first (Comhaltas uses WordPress)
    try {
      const r = await fetch('https://comhaltas.ie/wp-json/tribe/events/v1/events?per_page=50', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'comhaltas-ie', source_id: `cce-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'Comhaltas Ceoltóirí Éireann',
          location_name: e.venue?.venue ?? 'Ireland',
          lat: parseFloat(e.venue?.geo_lat ?? '53.3498'),
          lng: parseFloat(e.venue?.geo_lng ?? '-6.2603'),
          starts_at: new Date(e.start_date).toISOString(),
          cost: e.cost ?? 'See event page',
        }))
      }
    } catch {}

    // Try The Events Calendar REST v2
    try {
      const r = await fetch('https://comhaltas.ie/wp-json/tribe/events/v1/events?per_page=50&start_date=now', {
        headers: { Accept: 'application/json', 'User-Agent': 'Emerge/1.0' },
        signal: AbortSignal.timeout(12000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'comhaltas-ie', source_id: `cce-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'Comhaltas Ceoltóirí Éireann',
          location_name: e.venue?.venue ?? 'Ireland',
          lat: parseFloat(e.venue?.geo_lat ?? '53.3498'),
          lng: parseFloat(e.venue?.geo_lng ?? '-6.2603'),
          starts_at: new Date(e.start_date).toISOString(),
          cost: e.cost ?? 'See event page',
        }))
      }
    } catch {}

    // Fallback: scrape HTML
    for (const url of URLS) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(12000),
        })
        if (!r.ok) continue
        const html = await r.text()

        const ld = extractJsonLd(html, 'comhaltas-ie')
        if (ld.length > 0) return ld

        const out: RawEvent[] = []
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|tribe|session|ceili|fleadh)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
        let m
        while ((m = rx.exec(html)) !== null) {
          const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5) continue

          const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+\w+\s+\d{4})/i)
          let starts = new Date().toISOString()
          if (dm) { const p = new Date(dm[1] || dm[2]); if (!isNaN(p.getTime())) starts = p.toISOString() }

          out.push({
            source: 'comhaltas-ie', source_id: `cce-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: `Comhaltas traditional Irish music event. Sessions, céilís, workshops — all welcome.`,
            organizer: 'Comhaltas Ceoltóirí Éireann', location_name: 'Ireland',
            lat: 53.3498, lng: -6.2603, starts_at: starts, cost: 'See event page',
          })
        }
        if (out.length > 0) return out
      } catch { continue }
    }
    return []
  },
}
