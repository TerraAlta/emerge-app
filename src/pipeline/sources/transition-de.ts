/**
 * Transition Towns Deutschland — transition-initiativen.org
 * (transitiontowns.de redirects to transition-initiativen.org)
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractGermanDate } from './german-utils'

const URLS = [
  'https://www.transition-initiativen.org/events',
  'https://www.transition-initiativen.org/termine',
  'https://transitiontowns.de/events/',
  'https://transitiontowns.de/termine/',
]

export const transitionDe: SourceFetcher = {
  name: 'transition-de',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'transition-de')
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
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|termin|views-row|node--type-event|initiative)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    const locMatch = block.match(/(?:class="[^"]*(?:ort|location|city)[^"]*"[^>]*>)([\s\S]*?)<\//i)

    events.push({
      source: 'transition-de',
      source_id: `tr-de-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title,
      description: 'Transition Initiative Veranstaltung.',
      organizer: 'Transition Towns Deutschland',
      location_name: locMatch ? stripHtml(locMatch[1]).trim() : 'Deutschland',
      lat: 0, lng: 0,
      starts_at: extractGermanDate(block),
      cost: 'Siehe Veranstaltung',
    })
  }
  return events
}
