/**
 * PRI Global — Permaculture Research Institute — permaculturenews.org
 * Global courses, workshops, and permaculture design certificates.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://www.permaculturenews.org'

export const priGlobal: SourceFetcher = {
  name: 'pri-global',
  async fetch() {
    // Strategy 1: Tribe Events API
    try {
      const res = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.events?.length > 0) {
          return data.events.map((e: any) => ({
            source: 'pri-global', source_id: `prig-${e.id}`,
            source_url: e.url ?? `${BASE}/events/`,
            title: stripHtml(e.title ?? ''),
            description: stripHtml(e.description ?? '').slice(0, 500),
            organizer: e.organizer?.[0]?.organizer ?? 'Permaculture Research Institute',
            location_name: e.venue?.venue ?? e.venue?.city ?? 'See event',
            lat: parseFloat(e.venue?.geo_lat ?? '0'), lng: parseFloat(e.venue?.geo_lng ?? '0'),
            starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'See event',
          }))
        }
      }
    } catch {}

    // Strategy 2: HTML pages — JSON-LD then scrape
    const urls = [`${BASE}/events/`, `${BASE}/upcoming-events/`]
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'pri-global')
        if (jsonLd.length > 0) return jsonLd

        return scrape(html, url)
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, base: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|tribe|course|workshop)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'pri-global', source_id: `prig-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], base).toString() : base,
      title, description: 'PRI permaculture event.',
      organizer: 'Permaculture Research Institute',
      location_name: 'See event', lat: 0, lng: 0,
      starts_at: new Date().toISOString(), cost: 'See event',
    })
  }
  return events
}
