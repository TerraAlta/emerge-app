/**
 * Damanhur — damanhur.org events
 * Ecovillage and spiritual community events in Piemonte, Italy.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractItalianDate, geocodeItalianCity } from './south-eu-utils'

const URLS = [
  'https://www.damanhur.org/en/events/',
  'https://www.damanhur.org/eventi/',
]
const DEFAULT_LAT = 45.4166
const DEFAULT_LNG = 7.8833

export const damanhurIt: SourceFetcher = {
  name: 'damanhur-it',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'damanhur-it')
        if (jsonLd.length > 0) return jsonLd

        const base = new URL(url).origin
        try {
          const apiRes = await fetch(`${base}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => {
                const geo = geocodeItalianCity(e.venue?.city || '')
                return {
                  source: 'damanhur-it', source_id: `dmh-${e.id}`,
                  source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: e.organizer?.[0]?.organizer ?? 'Damanhur',
                  location_name: e.venue?.venue ?? 'Damanhur, Piemonte, Italy',
                  lat: parseFloat(e.venue?.geo_lat ?? '0') || geo?.lat || DEFAULT_LAT,
                  lng: parseFloat(e.venue?.geo_lng ?? '0') || geo?.lng || DEFAULT_LNG,
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'See event',
                } satisfies RawEvent
              })
            }
          }
        } catch {}

        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|program|visit|workshop|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    const geo = geocodeItalianCity(block) || { lat: DEFAULT_LAT, lng: DEFAULT_LNG }

    events.push({
      source: 'damanhur-it', source_id: `dmh-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title, description: 'Damanhur event. See link for details.',
      organizer: 'Damanhur', location_name: 'Damanhur, Piemonte, Italy',
      lat: geo.lat, lng: geo.lng,
      starts_at: extractItalianDate(block), cost: 'See event',
    })
  }
  return events
}
