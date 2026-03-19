/** OLIO — olioapp.com — community swap days and neighbourhood sharing events */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = ['https://olioapp.com/events/', 'https://olioapp.com/en/events/', 'https://olioapp.com/community-events/']

export const olioGlobal: SourceFetcher = {
  name: 'olio-global',
  async fetch() {
    // 1. Tribe Events API
    try {
      const r = await fetch('https://olioapp.com/wp-json/tribe/events/v1/events?per_page=30', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'olio-global', source_id: `olio-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'OLIO',
          location_name: e.venue?.venue ?? 'See event page',
          lat: parseFloat(e.venue?.geo_lat ?? '0'), lng: parseFloat(e.venue?.geo_lng ?? '0'),
          starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'Free',
        }))
      }
    } catch {}
    // 2. WP REST + JSON-LD + HTML scrape
    for (const url of URLS) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) continue
        const html = await r.text()
        const ld = extractJsonLd(html, 'olio-global')
        if (ld.length > 0) return ld
        const out: RawEvent[] = []
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|swap|share|community|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
        let m
        while ((m = rx.exec(html)) !== null) {
          const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5 || /^(menu|nav|search)/i.test(title)) continue
          const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+\w+\s+\d{4})/i)
          let starts = new Date().toISOString()
          if (dm) { const p = new Date(dm[1] || dm[2]); if (!isNaN(p.getTime())) starts = p.toISOString() }
          out.push({
            source: 'olio-global', source_id: `olio-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: 'OLIO community sharing event.',
            organizer: 'OLIO', location_name: 'See event page',
            lat: 0, lng: 0, starts_at: starts, cost: 'Free',
          })
        }
        if (out.length > 0) return out
      } catch { continue }
    }
    return []
  },
}
