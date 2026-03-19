/**
 * OUR Ecovillage — iconic Canadian ecovillage on Vancouver Island
 * Shawnigan Lake, BC
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://ourecovillage.org'
const URLS = [`${BASE}/events/`, `${BASE}/whats-happening/`]
const DEFAULT_LAT = 48.55
const DEFAULT_LNG = -123.55

export const ourEcovillageCa: SourceFetcher = {
  name: 'our-ecovillage-ca',
  async fetch(opts: { lat: number; lng: number; radiusKm: number }) {
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
            source: 'our-ecovillage-ca',
            source_id: `oev-${p.id}`,
            source_url: p.link ?? `${BASE}/events/`,
            title: stripHtml(p.title?.rendered ?? ''),
            description: stripHtml(p.excerpt?.rendered ?? '').slice(0, 500),
            organizer: 'OUR Ecovillage',
            location_name: 'Shawnigan Lake, BC',
            lat: DEFAULT_LAT, lng: DEFAULT_LNG,
            starts_at: new Date().toISOString(),
            cost: 'See event',
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

        const jsonLd = extractJsonLd(html, 'our-ecovillage-ca')
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
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|workshop|course|volunteer|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'our-ecovillage-ca', source_id: `oev-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'OUR Ecovillage event. See link for details.',
      organizer: 'OUR Ecovillage', location_name: 'Shawnigan Lake, BC',
      lat: DEFAULT_LAT, lng: DEFAULT_LNG,
      starts_at: new Date().toISOString(), cost: 'See event',
    })
  }
  return events
}
