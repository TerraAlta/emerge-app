/**
 * Les Grosses Légumes — lesgrosseslegumes.be
 * Wallonia community-supported agriculture events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractFrenchDate, geocodeFrBe } from './french-utils'

const BASE = 'https://lesgrosseslegumes.be'
const URLS = [
  `${BASE}/agenda/`,
  `${BASE}/evenements/`,
]

export const csaWallonieBe: SourceFetcher = {
  name: 'csa-wallonie-be',
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
                const geo = geocodeFrBe(e.venue?.city ?? e.venue?.address ?? '') ?? { lat: 0, lng: 0 }
                return {
                  source: 'csa-wallonie-be', source_id: `csaw-${e.id}`,
                  source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: e.organizer?.[0]?.organizer ?? 'Les Grosses Légumes',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'Wallonie',
                  lat: parseFloat(e.venue?.geo_lat ?? '0') || geo.lat,
                  lng: parseFloat(e.venue?.geo_lng ?? '0') || geo.lng,
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'Voir événement',
                }
              })
            }
          }
        } catch {}

        const jsonLd = extractJsonLd(html, 'csa-wallonie-be')
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
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|agenda|ferme|recolte|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    const locMatch = block.match(/(?:class="[^"]*(?:lieu|location|city)[^"]*"[^>]*>)([\s\S]*?)<\//i)
    const locName = locMatch ? stripHtml(locMatch[1]).trim() : 'Wallonie'
    const geo = geocodeFrBe(locName) ?? { lat: 0, lng: 0 }

    events.push({
      source: 'csa-wallonie-be', source_id: `csaw-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title, description: 'Événement Les Grosses Légumes. Voir le lien.',
      organizer: 'Les Grosses Légumes', location_name: locName,
      lat: geo.lat, lng: geo.lng,
      starts_at: extractFrenchDate(block), cost: 'Voir événement',
    })
  }
  return events
}
