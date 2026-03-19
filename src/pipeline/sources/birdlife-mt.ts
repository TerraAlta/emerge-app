/** BirdLife Malta — birdlifemalta.org — conservation volunteering and events */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = ['https://birdlifemalta.org/events/', 'https://birdlifemalta.org/whats-on/', 'https://www.birdlifemalta.org/events/']

export const birdlifeMt: SourceFetcher = {
  name: 'birdlife-mt',
  async fetch() {
    // 1. Tribe Events API
    try {
      const r = await fetch('https://birdlifemalta.org/wp-json/tribe/events/v1/events?per_page=30', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'birdlife-mt', source_id: `blm-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'BirdLife Malta',
          location_name: e.venue?.venue ?? 'Malta',
          lat: parseFloat(e.venue?.geo_lat ?? '35.9375'), lng: parseFloat(e.venue?.geo_lng ?? '14.3754'),
          starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'See event page',
        }))
      }
    } catch {}
    // 2. WP REST API
    try {
      const r = await fetch('https://birdlifemalta.org/wp-json/wp/v2/posts?per_page=20&categories=events', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const posts: any[] = await r.json()
        if (posts.length > 0) return posts.map(p => ({
          source: 'birdlife-mt', source_id: `blm-${p.id}`,
          source_url: p.link ?? null, title: stripHtml(p.title?.rendered ?? ''),
          description: stripHtml(p.excerpt?.rendered ?? '').slice(0, 500),
          organizer: 'BirdLife Malta', location_name: 'Malta',
          lat: 35.9375, lng: 14.3754,
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
        const ld = extractJsonLd(html, 'birdlife-mt')
        if (ld.length > 0) return ld
        const out: RawEvent[] = []
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|volunteer|activity|walk|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
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
            source: 'birdlife-mt', source_id: `blm-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: 'BirdLife Malta conservation event.',
            organizer: 'BirdLife Malta', location_name: 'Malta',
            lat: 35.9375, lng: 14.3754, starts_at: starts, cost: 'See event page',
          })
        }
        if (out.length > 0) return out
      } catch { continue }
    }
    return []
  },
}
