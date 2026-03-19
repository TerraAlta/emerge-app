/**
 * Solidarische Landwirtschaft (SoLaWi) — solidarische-landwirtschaft.org
 * Community Supported Agriculture network. Farm events, harvest days, open days.
 * They have a farm finder map with embedded data.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, haversine, extractJsonLd } from './utils'
import { extractGermanDate } from './german-utils'

const BASE = 'https://www.solidarische-landwirtschaft.org'
const URLS = [
  `${BASE}/solawis-finden/`,
  `${BASE}/veranstaltungen/`,
  `${BASE}/termine/`,
]

export const solawiDe: SourceFetcher = {
  name: 'solawi-de',
  async fetch({ lat, lng, radiusKm }) {
    // Strategy 1: Try events/termine pages
    for (const url of URLS.slice(1)) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'solawi-de')
        if (jsonLd.length > 0) return jsonLd

        // Try Tribe Events API
        try {
          const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: 'solawi-de',
                source_id: `solawi-${e.id}`,
                source_url: e.url ?? url,
                title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? 'Solidarische Landwirtschaft',
                location_name: e.venue?.venue ?? 'Deutschland',
                lat: parseFloat(e.venue?.geo_lat ?? '0'),
                lng: parseFloat(e.venue?.geo_lng ?? '0'),
                starts_at: new Date(e.start_date).toISOString(),
                cost: e.cost ?? 'Siehe Veranstaltung',
              }))
            }
          }
        } catch {}

        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }

    // Strategy 2: Scrape the farm finder for nearby SoLaWi farms
    try {
      const res = await fetch(URLS[0], {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return []
      const html = await res.text()

      // Look for embedded map data (JSON markers)
      const jsonMatch = html.match(/(?:var\s+(?:farms|solawis|markers|mapData)\s*=|"features"\s*:)\s*(\[[\s\S]*?\])/)
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1])
          return data
            .filter((f: any) => {
              const fLat = parseFloat(f.lat || f.latitude || f.geometry?.coordinates?.[1] || '0')
              const fLng = parseFloat(f.lng || f.longitude || f.geometry?.coordinates?.[0] || '0')
              return fLat && fLng && haversine(lat, lng, fLat, fLng) <= radiusKm
            })
            .slice(0, 15)
            .map((f: any) => {
              const name = stripHtml(f.name || f.title || f.properties?.name || '')
              return {
                source: 'solawi-de',
                source_id: `solawi-farm-${f.id || hashStr(name)}`,
                source_url: f.url || f.link || `${BASE}/solawis-finden/`,
                title: `SoLaWi — ${name || 'Solidarische Landwirtschaft'}`,
                description: stripHtml(f.description || '').slice(0, 500) || 'Community Supported Agriculture farm. Volunteer days, harvest shares, and farm community.',
                organizer: name || 'SoLaWi',
                location_name: f.address || f.city || 'Deutschland',
                lat: parseFloat(f.lat || f.latitude || f.geometry?.coordinates?.[1] || '0'),
                lng: parseFloat(f.lng || f.longitude || f.geometry?.coordinates?.[0] || '0'),
                starts_at: new Date().toISOString(),
                cost: 'Membership-based',
              }
            })
        } catch {}
      }
    } catch {}

    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|veranstaltung|termin|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    events.push({
      source: 'solawi-de',
      source_id: `solawi-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title,
      description: 'SoLaWi Veranstaltung.',
      organizer: 'Solidarische Landwirtschaft',
      location_name: 'Deutschland',
      lat: 0, lng: 0,
      starts_at: extractGermanDate(block),
      cost: 'Siehe Veranstaltung',
    })
  }
  return events
}
