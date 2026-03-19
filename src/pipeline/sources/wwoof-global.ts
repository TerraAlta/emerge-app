/**
 * WWOOF Global — wwoof.net
 * Membership-walled. Attempts public pages for host teasers, returns empty
 * with documentation if nothing is publicly available.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const PAGES = [
  'https://wwoof.net/',
  'https://wwoof.net/find-a-wwoof-host/',
]

export const wwoofGlobal: SourceFetcher = {
  name: 'wwoof-global',
  async fetch() {
    for (const url of PAGES) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'wwoof-global')
        if (jsonLd.length > 0) return jsonLd

        const scraped = scrape(html, url)
        if (scraped.length > 0) return scraped
      } catch { continue }
    }

    console.log(
      'WWOOF chapters tested: wwoof.net (global), wwoof.pt, wwoof.es, wwoofusa.org, wwoof.ca ' +
      '— all require membership. Use manual submissions in data/submissions/wwoof/',
    )
    return []
  },
}

function scrape(html: string, base: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:div|article)[^>]*class="[^"]*(?:host|farm|listing)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi
  let m
  while ((m = pattern.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'wwoof-global', source_id: `wwoofg-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], base).toString() : base,
      title: `WWOOF — ${title}`,
      description: 'Organic farm seeking volunteers. Food & accommodation provided.',
      organizer: title, location_name: 'See listing', lat: 0, lng: 0,
      starts_at: new Date().toISOString(), cost: 'Membership required',
    })
  }
  return events
}
