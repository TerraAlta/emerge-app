/**
 * Permakultur Institut Deutschland — permakultur.de/veranstaltungen
 * Courses, workshops, PDCs, gatherings.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractGermanDate } from './german-utils'

const BASE = 'https://permakultur.de'
const URLS = [
  `${BASE}/veranstaltungen/`,
  `${BASE}/termine/`,
  `${BASE}/events/`,
]

export const permakulturDe: SourceFetcher = {
  name: 'permakultur-de',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'permakultur-de')
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
                source: 'permakultur-de',
                source_id: `pk-de-${e.id}`,
                source_url: e.url ?? url,
                title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? 'Permakultur Institut',
                location_name: e.venue?.venue ?? e.venue?.city ?? 'Deutschland',
                lat: parseFloat(e.venue?.geo_lat ?? '0'),
                lng: parseFloat(e.venue?.geo_lng ?? '0'),
                starts_at: new Date(e.start_date).toISOString(),
                cost: e.cost ?? 'Siehe Veranstaltung',
              }))
            }
          }
        } catch {}

        return scrapeHtml(html, url)
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|veranstaltung|tribe|termin|kurs|seminar)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    events.push({
      source: 'permakultur-de',
      source_id: `pk-de-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title,
      description: 'Permakultur Veranstaltung. Siehe Link für Details.',
      organizer: 'Permakultur Institut Deutschland',
      location_name: 'Deutschland',
      lat: 0, lng: 0,
      starts_at: extractGermanDate(block),
      cost: 'Siehe Veranstaltung',
    })
  }
  return events
}
