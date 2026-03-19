/**
 * CSA Netwerk Vlaanderen — csa-netwerk.be
 * Flanders community-supported agriculture events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractDutchDate, geocodeDutchCity } from './dutch-utils'

const BASE = 'https://csa-netwerk.be'
const URLS = [
  `${BASE}/agenda/`,
  `${BASE}/events/`,
  `${BASE}/`,
]

export const csaBe: SourceFetcher = {
  name: 'csa-be',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        // Try Tribe Events Calendar API
        try {
          const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => {
                const geo = geocodeDutchCity(e.venue?.city || '')
                return {
                  source: 'csa-be', source_id: `csa-be-${e.id}`,
                  source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: e.organizer?.[0]?.organizer ?? 'CSA Netwerk Vlaanderen',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'Vlaanderen',
                  lat: parseFloat(e.venue?.geo_lat ?? '0') || geo?.lat || 0,
                  lng: parseFloat(e.venue?.geo_lng ?? '0') || geo?.lng || 0,
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'Zie evenement',
                }
              })
            }
          }
        } catch {}

        const jsonLd = extractJsonLd(html, 'csa-be')
        if (jsonLd.length > 0) return jsonLd

        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|agenda|boerderij|oogst|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    const locMatch = block.match(/(?:class="[^"]*(?:locatie|location|plaats)[^"]*"[^>]*>)([\s\S]*?)<\//i)
    const location = locMatch ? stripHtml(locMatch[1]).trim() : 'Vlaanderen'
    const geo = geocodeDutchCity(location)

    events.push({
      source: 'csa-be', source_id: `csa-be-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title, description: 'CSA Netwerk Vlaanderen evenement. Zie link voor details.',
      organizer: 'CSA Netwerk Vlaanderen', location_name: location,
      lat: geo?.lat || 0, lng: geo?.lng || 0,
      starts_at: extractDutchDate(block), cost: 'Zie evenement',
    })
  }
  return events
}
