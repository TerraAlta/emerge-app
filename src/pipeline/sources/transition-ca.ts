/**
 * Transition Canada — uses transitionnetwork.org filtered for Canada
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { geocodeNaCity } from './na-utils'

const URLS = [
  'https://transitionnetwork.org/transition-near-me/?country=CA',
  'https://transitionnetwork.org/news-and-blog/?country=CA',
]

export const transitionCa: SourceFetcher = {
  name: 'transition-ca',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'transition-ca')
        if (jsonLd.length > 0) return jsonLd

        const events = scrape(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:initiative|hub|group|event|listing)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pattern.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const geo = geocodeNaCity(m[1] + ' ' + title)
    events.push({
      source: 'transition-ca', source_id: `tca-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'Canadian Transition initiative.',
      organizer: 'Transition Canada', location_name: 'Canada',
      lat: geo?.lat || 0, lng: geo?.lng || 0,
      starts_at: new Date().toISOString(), cost: 'See event',
    })
  }
  return events
}
