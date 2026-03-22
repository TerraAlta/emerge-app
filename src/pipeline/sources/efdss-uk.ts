/** EFDSS / Cecil Sharp House — efdss.org/events — English folk dance & song events */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://www.efdss.org/events',
  'https://www.efdss.org/whats-on',
  'https://efdss.org/events',
]

export const efdssUk: SourceFetcher = {
  name: 'efdss-uk',
  async fetch() {
    // Try WordPress REST API
    try {
      const r = await fetch('https://www.efdss.org/wp-json/tribe/events/v1/events?per_page=50', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'efdss-uk', source_id: `efdss-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'EFDSS / Cecil Sharp House',
          location_name: e.venue?.venue ?? 'Cecil Sharp House, London',
          lat: parseFloat(e.venue?.geo_lat ?? '51.5384'),
          lng: parseFloat(e.venue?.geo_lng ?? '-0.1426'),
          starts_at: new Date(e.start_date).toISOString(),
          cost: e.cost ?? 'See event page',
        }))
      }
    } catch {}

    for (const url of URLS) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(12000),
        })
        if (!r.ok) continue
        const html = await r.text()
        const ld = extractJsonLd(html, 'efdss-uk')
        if (ld.length > 0) return ld

        const out: RawEvent[] = []
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|folk|dance|song|ceilidh)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
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
            source: 'efdss-uk', source_id: `efdss-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: 'EFDSS folk dance and song event. Participatory sessions, ceilidhs, singing workshops.',
            organizer: 'EFDSS / Cecil Sharp House',
            location_name: 'Cecil Sharp House, London',
            lat: 51.5384, lng: -0.1426, starts_at: starts, cost: 'See event page',
          })
        }
        if (out.length > 0) return out
      } catch { continue }
    }
    return []
  },
}
