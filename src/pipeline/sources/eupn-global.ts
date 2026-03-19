/** European Permaculture Network — GLOBAL feed */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://permaculture-network.eu'
const URLS = [`${BASE}/courses-events/`, `${BASE}/events/`]

export const eupnGlobal: SourceFetcher = {
  name: 'eupn-global',
  async fetch() {
    // 1. Try WP REST API
    try {
      const r = await fetch(`${BASE}/wp-json/wp/v2/posts?per_page=30&categories=events`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const posts: any[] = await r.json()
        if (posts.length > 0) return posts.map(p => ({
          source: 'eupn-global', source_id: `eupn-g-${p.id}`,
          source_url: p.link ?? null, title: stripHtml(p.title?.rendered ?? ''),
          description: stripHtml(p.excerpt?.rendered ?? '').slice(0, 500),
          organizer: 'European Permaculture Network',
          location_name: 'Europe', lat: 0, lng: 0,
          starts_at: new Date(p.date).toISOString(), cost: 'See event page',
        }))
      }
    } catch {}

    // 2. Try Tribe Events API
    try {
      const r = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=30`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'eupn-global', source_id: `eupn-g-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'European Permaculture Network',
          location_name: e.venue?.venue ?? 'Europe',
          lat: parseFloat(e.venue?.geo_lat ?? '0'), lng: parseFloat(e.venue?.geo_lng ?? '0'),
          starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'See event page',
        }))
      }
    } catch {}

    // 3. HTML scrape
    for (const url of URLS) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) continue
        const html = await r.text()
        const ld = extractJsonLd(html, 'eupn-global')
        if (ld.length > 0) return ld
        const ev = scrape(html, url)
        if (ev.length > 0) return ev
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, base: string): RawEvent[] {
  const out: RawEvent[] = []
  const rx = /<(?:article|div|li|section)[^>]*class="[^"]*(?:event|course|workshop|tribe|views-row)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
  let m
  while ((m = rx.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5 || /^(menu|nav|search|cookie)/i.test(title)) continue
    const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i)
    let starts = new Date().toISOString()
    if (dm) { const p = new Date(dm[1] || dm[2]); if (!isNaN(p.getTime())) starts = p.toISOString() }
    const desc = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    out.push({
      source: 'eupn-global', source_id: `eupn-g-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], base).toString() : base, title,
      description: desc ? stripHtml(desc[1]).slice(0, 500) : 'European permaculture event.',
      organizer: 'European Permaculture Network', location_name: 'Europe', lat: 0, lng: 0,
      starts_at: starts, cost: 'See event page',
    })
  }
  return out
}
