/**
 * Seed Libraries Canada — seed swaps, seed libraries, community events
 * Toronto, Ontario
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://seedlibraries.ca'
const URLS = [`${BASE}/events/`, `${BASE}/seed-swaps/`]
const DEFAULT_LAT = 43.6532
const DEFAULT_LNG = -79.3832

export const seedLibrariesCa: SourceFetcher = {
  name: 'seed-libraries-ca',
  async fetch() {
    // Strategy 1: WP REST API
    try {
      const res = await fetch(`${BASE}/wp-json/wp/v2/posts?per_page=20&_fields=id,title,link,excerpt`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          return data.map((p: any) => ({
            source: 'seed-libraries-ca',
            source_id: `slca-${p.id}`,
            source_url: p.link ?? `${BASE}/events/`,
            title: stripHtml(p.title?.rendered ?? ''),
            description: stripHtml(p.excerpt?.rendered ?? '').slice(0, 500),
            organizer: 'Seed Libraries Canada',
            location_name: 'Canada',
            lat: DEFAULT_LAT, lng: DEFAULT_LNG,
            starts_at: new Date().toISOString(),
            cost: 'Free',
          }))
        }
      }
    } catch {}

    // Strategy 2 & 3: JSON-LD then HTML scrape
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'seed-libraries-ca')
        if (jsonLd.length > 0) return jsonLd

        const events = scrape(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|seed|swap|library|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'seed-libraries-ca', source_id: `slca-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'Seed library event. See link for details.',
      organizer: 'Seed Libraries Canada',
      location_name: 'Canada',
      lat: DEFAULT_LAT, lng: DEFAULT_LNG,
      starts_at: new Date().toISOString(), cost: 'Free',
    })
  }
  return events
}
