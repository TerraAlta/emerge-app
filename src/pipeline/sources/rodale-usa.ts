/**
 * Rodale Institute — rodaleinstitute.org/events
 * Pioneer of regenerative agriculture. Farm events, workshops, open days.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://rodaleinstitute.org'
// Rodale is in Kutztown, PA
const RODALE_LAT = 40.5176
const RODALE_LNG = -75.7774

export const rodaleUsa: SourceFetcher = {
  name: 'rodale-usa',
  async fetch() {
    const urls = [`${BASE}/events/`, `${BASE}/education/events/`]

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'rodale-usa')
        if (jsonLd.length > 0) {
          // Add Rodale coordinates to events missing geo
          return jsonLd.map(e => ({
            ...e,
            lat: e.lat || RODALE_LAT,
            lng: e.lng || RODALE_LNG,
            location_name: e.location_name === 'See event page' ? 'Rodale Institute, Kutztown, PA' : e.location_name,
          }))
        }

        // Tribe Events
        try {
          const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: 'rodale-usa', source_id: `rodale-${e.id}`,
                source_url: e.url ?? url,
                title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: 'Rodale Institute',
                location_name: e.venue?.venue ?? 'Rodale Institute, Kutztown, PA',
                lat: parseFloat(e.venue?.geo_lat ?? '0') || RODALE_LAT,
                lng: parseFloat(e.venue?.geo_lng ?? '0') || RODALE_LNG,
                starts_at: new Date(e.start_date).toISOString(),
                cost: e.cost ?? 'See event',
              }))
            }
          }
        } catch {}

        return scrape(html, url)
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|tribe|workshop|program)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pattern.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const dateMatch = m[1].match(/datetime="([^"]*)"/) || m[1].match(/(\w+ \d{1,2},?\s+\d{4})/)
    let startsAt = new Date().toISOString()
    if (dateMatch) { const d = new Date(dateMatch[1]); if (!isNaN(d.getTime())) startsAt = d.toISOString() }

    events.push({
      source: 'rodale-usa', source_id: `rodale-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'Rodale Institute event — regenerative agriculture.',
      organizer: 'Rodale Institute',
      location_name: 'Rodale Institute, Kutztown, PA',
      lat: RODALE_LAT, lng: RODALE_LNG,
      starts_at: startsAt, cost: 'See event',
    })
  }
  return events
}
