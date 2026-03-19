/**
 * The Conservation Volunteers (TCV) — tcv.org.uk
 * UK's leading practical conservation charity. Volunteering sessions,
 * Green Gyms, habitat restoration events across the country.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://www.tcv.org.uk'
const URLS = [`${BASE}/volunteering/`, `${BASE}/events/`]
const DEFAULT_LAT = 51.5074
const DEFAULT_LNG = -0.1278

export const tcvUk: SourceFetcher = {
  name: 'tcv-uk',
  async fetch({ lat, lng, radiusKm }) {
    for (const url of URLS) {
      // Tier 1: WP REST / Tribe Events API
      try {
        const apiBase = url.replace(/\/(?:events|volunteering)\/?$/, '')
        const apiRes = await fetch(`${apiBase}/wp-json/tribe/events/v1/events?per_page=20`, {
          headers: { 'User-Agent': 'Emerge-App/1.0', Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        })
        if (apiRes.ok) {
          const data = await apiRes.json()
          if (data.events?.length > 0) {
            return data.events.map((e: any) => ({
              source: 'tcv-uk',
              source_id: `tcv-${e.id}`,
              source_url: e.url ?? url,
              title: stripHtml(e.title ?? ''),
              description: stripHtml(e.description ?? '').slice(0, 500),
              organizer: e.organizer?.[0]?.organizer ?? 'The Conservation Volunteers',
              location_name: e.venue?.venue ?? e.venue?.city ?? 'UK',
              lat: parseFloat(e.venue?.geo_lat ?? '0') || DEFAULT_LAT,
              lng: parseFloat(e.venue?.geo_lng ?? '0') || DEFAULT_LNG,
              starts_at: new Date(e.start_date).toISOString(),
              ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
              cost: e.cost ?? 'Free',
            }))
          }
        }
      } catch {}

      // Tier 2 & 3: HTML page → JSON-LD → scrape
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'tcv-uk')
        if (jsonLd.length > 0) return jsonLd

        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    console.warn('[tcv-uk] all URLs failed')
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|volunteer|activity|session|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null && events.length < 30) {
    const block = match[1]
    const tm = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!tm) continue
    const title = stripHtml(tm[2]).trim()
    if (!title || title.length < 5) continue
    const dm = block.match(/datetime="([^"]*)"/) || block.match(/(\d{1,2}\s+\w+\s+\d{4})/)
    let startsAt = new Date().toISOString()
    if (dm) { const p = new Date(dm[1]); if (!isNaN(p.getTime())) startsAt = p.toISOString() }
    events.push({
      source: 'tcv-uk', source_id: `tcv-${hashStr(title)}`,
      source_url: tm[1] ? new URL(tm[1], BASE).toString() : baseUrl,
      title, description: 'TCV conservation volunteering session. Practical nature conservation for all abilities.',
      organizer: 'The Conservation Volunteers', location_name: 'UK',
      lat: DEFAULT_LAT, lng: DEFAULT_LNG, starts_at: startsAt, cost: 'Free',
    })
  }
  return events
}
