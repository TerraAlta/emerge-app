/**
 * PermacultuurNetwerk Belgium + Netherlands
 * permacultuurnetwerk.eu — courses, workshops, open days
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractDutchDate, geocodeDutchCity } from './dutch-utils'

const BASE = 'https://permacultuurnetwerk.eu'
const URLS = [
  `${BASE}/agenda/`,
  `${BASE}/events/`,
  `${BASE}/activiteiten/`,
]

export const permacultuurNl: SourceFetcher = {
  name: 'permacultuur-nl',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'permacultuur-nl')
        if (jsonLd.length > 0) return jsonLd

        // Try The Events Calendar API
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
                  source: 'permacultuur-nl',
                  source_id: `pcn-${e.id}`,
                  source_url: e.url ?? url,
                  title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: e.organizer?.[0]?.organizer ?? 'PermacultuurNetwerk',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'Nederland/België',
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
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|agenda|activiteit|tribe|cursus|workshop)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    const locMatch = block.match(/(?:class="[^"]*(?:locatie|location|venue)[^"]*"[^>]*>)([\s\S]*?)<\//i)
    const location = locMatch ? stripHtml(locMatch[1]).trim() : 'Nederland/België'
    const geo = geocodeDutchCity(location)

    events.push({
      source: 'permacultuur-nl',
      source_id: `pcn-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title,
      description: 'Permacultuur evenement. Zie link voor details.',
      organizer: 'PermacultuurNetwerk',
      location_name: location,
      lat: geo?.lat || 0, lng: geo?.lng || 0,
      starts_at: extractDutchDate(block),
      cost: 'Zie evenement',
    })
  }
  return events
}
