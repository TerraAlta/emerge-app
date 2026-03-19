/**
 * Ökodorf Sieben Linden — sieben-linden.de/veranstaltungen
 * Germany's most established ecovillage. Seminars, volunteer weeks, open days.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractGermanDate } from './german-utils'

const BASE = 'https://sieben-linden.de'
const URLS = [
  `${BASE}/veranstaltungen/`,
  `${BASE}/seminare/`,
  `${BASE}/termine/`,
]

// Sieben Linden coordinates
const SL_LAT = 52.6057
const SL_LNG = 11.1515

export const siebenLindenDe: SourceFetcher = {
  name: 'sieben-linden-de',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'sieben-linden-de')
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
                source: 'sieben-linden-de',
                source_id: `sl-${e.id}`,
                source_url: e.url ?? url,
                title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: 'Ökodorf Sieben Linden',
                location_name: 'Ökodorf Sieben Linden, Beetzendorf',
                lat: SL_LAT,
                lng: SL_LNG,
                starts_at: new Date(e.start_date).toISOString(),
                ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
                cost: e.cost ?? 'Siehe Veranstaltung',
              }))
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
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|veranstaltung|seminar|termin|tribe|workshop|kurs)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue
    if (/^(menu|nav|search|cookie|anmeld)/i.test(title)) continue

    const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)

    events.push({
      source: 'sieben-linden-de',
      source_id: `sl-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title,
      description: descMatch ? stripHtml(descMatch[1]).trim().slice(0, 500) : 'Veranstaltung im Ökodorf Sieben Linden.',
      organizer: 'Ökodorf Sieben Linden',
      location_name: 'Ökodorf Sieben Linden, Beetzendorf, Sachsen-Anhalt',
      lat: SL_LAT,
      lng: SL_LNG,
      starts_at: extractGermanDate(block),
      cost: 'Siehe Veranstaltung',
    })
  }
  return events
}
