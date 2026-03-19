/**
 * EDE Global — Gaia Education — gaiaeducation.org
 * Ecovillage Design Education courses and events worldwide.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const GAIA = 'https://www.gaiaeducation.org'
const PAGES = [
  'https://gaia.org/ede/',
  `${GAIA}/programmes/`,
  `${GAIA}/events/`,
]

export const edeGlobal: SourceFetcher = {
  name: 'ede-global',
  async fetch() {
    // Strategy 1: Tribe Events API on gaiaeducation.org
    try {
      const res = await fetch(`${GAIA}/wp-json/tribe/events/v1/events?per_page=20`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.events?.length > 0) {
          return data.events.map((e: any) => ({
            source: 'ede-global', source_id: `ede-${e.id}`,
            source_url: e.url ?? `${GAIA}/events/`,
            title: stripHtml(e.title ?? ''),
            description: stripHtml(e.description ?? '').slice(0, 500),
            organizer: e.organizer?.[0]?.organizer ?? 'Gaia Education',
            location_name: e.venue?.venue ?? e.venue?.city ?? 'See event',
            lat: parseFloat(e.venue?.geo_lat ?? '0'), lng: parseFloat(e.venue?.geo_lng ?? '0'),
            starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'See event',
          }))
        }
      }
    } catch {}

    // Strategy 2: HTML pages — JSON-LD then scrape
    for (const url of PAGES) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'ede-global')
        if (jsonLd.length > 0) return jsonLd

        const scraped = scrape(html, url)
        if (scraped.length > 0) return scraped
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, base: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|programme|course|ede|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'ede-global', source_id: `ede-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], base).toString() : base,
      title, description: 'Gaia Education programme or event.',
      organizer: 'Gaia Education',
      location_name: 'See listing', lat: 0, lng: 0,
      starts_at: new Date().toISOString(), cost: 'See event',
    })
  }
  return events
}
