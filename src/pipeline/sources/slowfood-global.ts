/**
 * Slow Food International — slowfood.com
 * Events, Terra Madre gatherings, and local food activities worldwide.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://www.slowfood.com'
const PAGES = [
  `${BASE}/events/`,
  `${BASE}/what-we-do/events/`,
]

export const slowfoodGlobal: SourceFetcher = {
  name: 'slowfood-global',
  async fetch() {
    // Strategy 1: JSON-LD (large org, likely has structured data)
    for (const url of PAGES) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'slowfood-global')
        if (jsonLd.length > 0) return jsonLd

        // Strategy 2: WP REST API
        try {
          const api = await fetch(`${BASE}/wp-json/wp/v2/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (api.ok) {
            const data = await api.json()
            if (Array.isArray(data) && data.length > 0) {
              return data.map((e: any) => ({
                source: 'slowfood-global', source_id: `sf-${e.id}`,
                source_url: e.link ?? url,
                title: stripHtml(e.title?.rendered ?? ''),
                description: stripHtml(e.excerpt?.rendered ?? '').slice(0, 500),
                organizer: 'Slow Food International',
                location_name: e.acf?.location ?? 'See event',
                lat: parseFloat(e.acf?.latitude ?? '0'), lng: parseFloat(e.acf?.longitude ?? '0'),
                starts_at: e.acf?.start_date ? new Date(e.acf.start_date).toISOString() : new Date().toISOString(),
                cost: 'See event page',
              }))
            }
          }
        } catch {}

        // Strategy 3: HTML scrape
        const scraped = scrape(html, url)
        if (scraped.length > 0) return scraped
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, base: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|activity|terra-madre|gathering)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'slowfood-global', source_id: `sf-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], base).toString() : base,
      title, description: 'Slow Food event.',
      organizer: 'Slow Food International',
      location_name: 'See event', lat: 0, lng: 0,
      starts_at: new Date().toISOString(), cost: 'See event page',
    })
  }
  return events
}
