/** Oxford Real Farming Conference — orfc.org.uk — annual conference + year-round events */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = ['https://orfc.org.uk/events/', 'https://orfc.org.uk/programme/', 'https://www.orfc.org.uk/events/']

export const orfcUk: SourceFetcher = {
  name: 'orfc-uk',
  async fetch() {
    // 1. Tribe Events API
    try {
      const r = await fetch('https://orfc.org.uk/wp-json/tribe/events/v1/events?per_page=30', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'orfc-uk', source_id: `orfc-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'Oxford Real Farming Conference',
          location_name: e.venue?.venue ?? 'Oxford',
          lat: parseFloat(e.venue?.geo_lat ?? '51.7520'), lng: parseFloat(e.venue?.geo_lng ?? '-1.2577'),
          starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'See event page',
        }))
      }
    } catch {}
    // 2. WP REST API
    try {
      const r = await fetch('https://orfc.org.uk/wp-json/wp/v2/posts?per_page=20&categories=events', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const posts: any[] = await r.json()
        if (posts.length > 0) return posts.map(p => ({
          source: 'orfc-uk', source_id: `orfc-${p.id}`,
          source_url: p.link ?? null, title: stripHtml(p.title?.rendered ?? ''),
          description: stripHtml(p.excerpt?.rendered ?? '').slice(0, 500),
          organizer: 'Oxford Real Farming Conference', location_name: 'Oxford',
          lat: 51.7520, lng: -1.2577,
          starts_at: new Date(p.date).toISOString(), cost: 'See event page',
        }))
      }
    } catch {}
    // 3. HTML scrape
    for (const url of URLS) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) continue
        const html = await r.text()
        const ld = extractJsonLd(html, 'orfc-uk')
        if (ld.length > 0) return ld
        const out: RawEvent[] = []
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|session|programme|talk|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
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
            source: 'orfc-uk', source_id: `orfc-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: 'Oxford Real Farming Conference event.',
            organizer: 'Oxford Real Farming Conference', location_name: 'Oxford',
            lat: 51.7520, lng: -1.2577, starts_at: starts, cost: 'See event page',
          })
        }
        if (out.length > 0) return out
      } catch { continue }
    }
    return []
  },
}
