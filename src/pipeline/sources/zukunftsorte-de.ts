/**
 * Netzwerk Zukunftsorte — netzwerk-zukunftsorte.de
 * Rural regenerative projects — co-living, open days, residencies.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractGermanDate } from './german-utils'

const URLS = [
  'https://www.netzwerk-zukunftsorte.de/veranstaltungen/',
  'https://www.netzwerk-zukunftsorte.de/termine/',
  'https://www.netzwerk-zukunftsorte.de/events/',
  'https://www.netzwerk-zukunftsorte.de/',
]

export const zukunftsorteDe: SourceFetcher = {
  name: 'zukunftsorte-de',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'zukunftsorte-de')
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
  const pattern = /<(?:article|div|li|section)[^>]*class="[^"]*(?:event|veranstaltung|termin|zukunftsort|project|ort|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue
    if (/^(menu|nav|search|cookie|datenschutz|impressum)/i.test(title)) continue

    const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)

    events.push({
      source: 'zukunftsorte-de',
      source_id: `zk-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title,
      description: descMatch ? stripHtml(descMatch[1]).trim().slice(0, 500) : 'Zukunftsort — regeneratives Projekt.',
      organizer: 'Netzwerk Zukunftsorte',
      location_name: 'Brandenburg / Deutschland',
      lat: 0, lng: 0,
      starts_at: extractGermanDate(block),
      cost: 'Siehe Veranstaltung',
    })
  }
  return events
}
