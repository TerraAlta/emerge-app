/**
 * Ecology Action Centre — Atlantic Canada's leading environmental org
 * Halifax, Nova Scotia
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://ecologyaction.ca'
const URLS = [`${BASE}/events/`, `${BASE}/whats-on/`]
const DEFAULT_LAT = 44.6488
const DEFAULT_LNG = -63.5752

export const ecologyActionCa: SourceFetcher = {
  name: 'ecology-action-ca',
  async fetch(opts: { lat: number; lng: number; radiusKm: number }) {
    // Strategy 1: WP REST / Tribe Events API
    try {
      const res = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.events?.length > 0) {
          return data.events.map((e: any) => ({
            source: 'ecology-action-ca',
            source_id: `eac-${e.id}`,
            source_url: e.url ?? `${BASE}/events/`,
            title: stripHtml(e.title ?? ''),
            description: stripHtml(e.description ?? '').slice(0, 500),
            organizer: e.organizer?.[0]?.organizer ?? 'Ecology Action Centre',
            location_name: e.venue?.venue ?? 'Halifax, NS',
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

        const jsonLd = extractJsonLd(html, 'ecology-action-ca')
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
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|action|workshop|volunteer|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'ecology-action-ca', source_id: `eac-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'Ecology Action Centre event. See link for details.',
      organizer: 'Ecology Action Centre',
      location_name: 'Halifax, NS',
      lat: DEFAULT_LAT, lng: DEFAULT_LNG,
      starts_at: new Date().toISOString(), cost: 'See event',
    })
  }
  return events
}
