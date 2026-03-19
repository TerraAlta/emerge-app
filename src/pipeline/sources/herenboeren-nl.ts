/**
 * Herenboeren — herenboeren.nl
 * 50+ community farms across Netherlands.
 * Members co-own the farm. Open days, harvest events, volunteer days.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractDutchDate, geocodeDutchCity } from './dutch-utils'

const BASE = 'https://www.herenboeren.nl'
const URLS = [
  `${BASE}/agenda/`,
  `${BASE}/evenementen/`,
  `${BASE}/events/`,
  `${BASE}/open-dagen/`,
]

export const herenborenNl: SourceFetcher = {
  name: 'herenboeren-nl',
  async fetch() {
    // Try events pages
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'herenboeren-nl')
        if (jsonLd.length > 0) return jsonLd

        // Try Tribe Events API
        try {
          const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => {
                const geo = geocodeDutchCity(e.venue?.city || e.venue?.venue || '')
                return {
                  source: 'herenboeren-nl',
                  source_id: `hb-${e.id}`,
                  source_url: e.url ?? url,
                  title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: e.organizer?.[0]?.organizer ?? 'Herenboeren',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'Nederland',
                  lat: parseFloat(e.venue?.geo_lat ?? '0') || geo?.lat || 0,
                  lng: parseFloat(e.venue?.geo_lng ?? '0') || geo?.lng || 0,
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'Zie evenement',
                }
              })
            }
          }
        } catch {}

        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }

    // Try the farm finder page for farm locations
    try {
      const res = await fetch(`${BASE}/vind-een-herenboerderij/`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const html = await res.text()
        // Look for embedded map markers
        const jsonMatch = html.match(/(?:var\s+(?:farms|markers|locations)\s*=|"features"\s*:)\s*(\[[\s\S]*?\])/)
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[1])
            return data.slice(0, 20).map((f: any) => ({
              source: 'herenboeren-nl',
              source_id: `hb-farm-${f.id || hashStr(f.name || f.title || '')}`,
              source_url: f.url || f.link || `${BASE}/vind-een-herenboerderij/`,
              title: `Herenboerderij ${stripHtml(f.name || f.title || '')}`,
              description: 'Community-owned farm. Members share the harvest, costs, and responsibilities. Volunteer days and open events regularly.',
              organizer: 'Herenboeren',
              location_name: f.address || f.city || 'Nederland',
              lat: parseFloat(f.lat || f.latitude || '0'),
              lng: parseFloat(f.lng || f.longitude || '0'),
              starts_at: new Date().toISOString(),
              cost: 'Membership-based',
            }))
          } catch {}
        }
      }
    } catch {}

    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|agenda|open-dag|evenement|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    const geo = geocodeDutchCity(block)
    events.push({
      source: 'herenboeren-nl',
      source_id: `hb-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title,
      description: 'Herenboeren evenement.',
      organizer: 'Herenboeren',
      location_name: 'Nederland',
      lat: geo?.lat || 0, lng: geo?.lng || 0,
      starts_at: extractDutchDate(block),
      cost: 'Zie evenement',
    })
  }
  return events
}
