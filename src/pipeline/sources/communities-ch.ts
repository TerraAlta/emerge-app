/**
 * Communities for Future — communitiesforfuture.org
 * Community initiatives, events, projects across Switzerland.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractMultiDate, geocodeSwiss } from './ch-mt-utils'

const BASE = 'https://communitiesforfuture.org'
const URLS = [`${BASE}/communities/`, `${BASE}/events/`]
const SRC = 'communities-ch', ORG = 'Communities for Future'

export const communitiesCh: SourceFetcher = {
  name: SRC,
  async fetch() {
    // Try WP REST API + Tribe Events API
    for (const api of [`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, `${BASE}/wp-json/wp/v2/posts?per_page=20`]) {
      try {
        const r = await fetch(api, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) })
        if (!r.ok) continue
        const json = await r.json()
        const items = json.events ?? (Array.isArray(json) ? json : null)
        if (items?.length > 0) {
          return items.map((e: any) => {
            const isTribe = !!e.start_date
            const geo = geocodeSwiss(e.venue?.city || e.title?.rendered || '')
            return {
              source: SRC, source_id: `cff-${e.id}`,
              source_url: e.url ?? e.link ?? URLS[0],
              title: stripHtml(isTribe ? e.title ?? '' : e.title?.rendered ?? ''),
              description: stripHtml((isTribe ? e.description : e.excerpt?.rendered) ?? '').slice(0, 500),
              organizer: e.organizer?.[0]?.organizer ?? ORG,
              location_name: e.venue?.venue ?? e.venue?.city ?? 'See event page',
              lat: parseFloat(e.venue?.geo_lat ?? '0') || geo?.lat || 0,
              lng: parseFloat(e.venue?.geo_lng ?? '0') || geo?.lng || 0,
              starts_at: new Date(e.start_date ?? e.date ?? Date.now()).toISOString(),
              cost: e.cost ?? 'See event page',
            }
          })
        }
      } catch { continue }
    }
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()
        const jsonLd = extractJsonLd(html, SRC)
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
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|community|initiative|project|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const geo = geocodeSwiss(block)
    events.push({
      source: SRC, source_id: `cff-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl, title,
      description: 'Communities for Future event.', organizer: ORG,
      location_name: geo ? 'Schweiz' : 'See event page',
      lat: geo?.lat || 0, lng: geo?.lng || 0,
      starts_at: extractMultiDate(block), cost: 'See event page',
    })
  }
  return events
}
