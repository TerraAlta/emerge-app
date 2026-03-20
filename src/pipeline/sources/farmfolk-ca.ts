/**
 * FarmFolk CityFolk — BC food systems charity, Feast of Fields events
 * Vancouver, BC
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://farmfolkcityfolk.ca'
const URLS = [`${BASE}/events/`, `${BASE}/whats-happening/`]
const DEFAULT_LAT = 49.2827
const DEFAULT_LNG = -123.1207

export const farmfolkCa: SourceFetcher = {
  name: 'farmfolk-ca',
  async fetch() {
    // Strategy 1: Tribe Events API
    try {
      const res = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.events?.length > 0) {
          return data.events.map((e: any) => ({
            source: 'farmfolk-ca',
            source_id: `ffcf-${e.id}`,
            source_url: e.url ?? `${BASE}/events/`,
            title: stripHtml(e.title ?? ''),
            description: stripHtml(e.description ?? '').slice(0, 500),
            organizer: e.organizer?.[0]?.organizer ?? 'FarmFolk CityFolk',
            location_name: e.venue?.venue ?? 'Vancouver, BC',
            lat: parseFloat(e.venue?.geo_lat ?? '0') || DEFAULT_LAT,
            lng: parseFloat(e.venue?.geo_lng ?? '0') || DEFAULT_LNG,
            starts_at: new Date(e.start_date).toISOString(),
            cost: e.cost ?? 'See event',
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

        const jsonLd = extractJsonLd(html, 'farmfolk-ca')
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
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|farm|feast|workshop|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'farmfolk-ca', source_id: `ffcf-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'FarmFolk CityFolk event. See link for details.',
      organizer: 'FarmFolk CityFolk',
      location_name: 'Vancouver, BC',
      lat: DEFAULT_LAT, lng: DEFAULT_LNG,
      starts_at: new Date().toISOString(), cost: 'See event',
    })
  }
  return events
}
