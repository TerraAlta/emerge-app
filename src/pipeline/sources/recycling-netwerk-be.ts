/**
 * Recycling Netwerk Benelux — recyclingnetwerk.org
 * Benelux recycling advocacy events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://recyclingnetwerk.org'
const URLS = [`${BASE}/events/`, `${BASE}/evenementen/`]
const DEF_LAT = 50.8503, DEF_LNG = 4.3517

export const recyclingNetwerkBe: SourceFetcher = {
  name: 'recycling-netwerk-be',
  async fetch() {
    for (const url of URLS) {
      try {
        // 1. WP REST / Tribe Events API
        try {
          const api = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (api.ok) {
            const data = await api.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any): RawEvent => ({
                source: 'recycling-netwerk-be', source_id: `rnb-${e.id}`,
                source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? 'Recycling Netwerk Benelux',
                location_name: e.venue?.venue ?? e.venue?.city ?? 'Belgium',
                lat: parseFloat(e.venue?.geo_lat ?? '0') || DEF_LAT,
                lng: parseFloat(e.venue?.geo_lng ?? '0') || DEF_LNG,
                starts_at: new Date(e.start_date).toISOString(),
                ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
                cost: e.cost ?? 'See event',
              }))
            }
          }
        } catch {}

        // 2. JSON-LD extraction
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()
        const jsonLd = extractJsonLd(html, 'recycling-netwerk-be')
        if (jsonLd.length > 0) return jsonLd

        // 3. HTML scrape fallback
        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|evenement|actie|campagne|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const dt = block.match(/datetime="([^"]*)"/)
    events.push({
      source: 'recycling-netwerk-be', source_id: `rnb-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'Recycling Netwerk Benelux event. See link for details.',
      organizer: 'Recycling Netwerk Benelux', location_name: 'Belgium',
      lat: DEF_LAT, lng: DEF_LNG,
      starts_at: dt ? new Date(dt[1]).toISOString() : new Date().toISOString(),
      cost: 'See event',
    })
  }
  return events
}
