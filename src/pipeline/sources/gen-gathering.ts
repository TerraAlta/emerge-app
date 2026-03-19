/**
 * European Ecovillage Gathering — ecovillagegathering.org
 * Annual gathering + workshops. Also checks GEN Europe activities page.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const PAGES = [
  'https://ecovillagegathering.org/',
  'https://ecovillagegathering.org/programme/',
  'https://gen-europe.org/activities/european-ecovillage-gathering/',
]

export const genGathering: SourceFetcher = {
  name: 'gen-gathering',
  async fetch() {
    for (const url of PAGES) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'gen-gathering')
        if (jsonLd.length > 0) return jsonLd

        const scraped = scrape(html, url)
        if (scraped.length > 0) return scraped
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, base: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|programme|gathering|workshop|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'gen-gathering', source_id: `geng-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], base).toString() : base,
      title, description: 'European Ecovillage Gathering event.',
      organizer: 'European Ecovillage Gathering',
      location_name: 'Europe', lat: 0, lng: 0,
      starts_at: new Date().toISOString(), cost: 'See event page',
    })
  }
  return events
}
