/**
 * Landworkers Alliance — landworkersalliance.org.uk/events
 * UK small-scale farmer network. Events, skill shares, farm open days.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://landworkersalliance.org.uk'
const EVENTS_URL = `${BASE}/events/`

export const landworkersUk: SourceFetcher = {
  name: 'landworkers-uk',
  async fetch() {
    // Strategy 1: The Events Calendar API
    try {
      const res = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
        headers: { 'User-Agent': 'Emerge-App/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.events?.length > 0) {
          return data.events.map((e: any) => ({
            source: 'landworkers-uk',
            source_id: `lwa-${e.id}`,
            source_url: e.url ?? EVENTS_URL,
            title: stripHtml(e.title ?? ''),
            description: stripHtml(e.description ?? '').slice(0, 500),
            organizer: e.organizer?.[0]?.organizer ?? 'Landworkers Alliance',
            location_name: e.venue?.venue ?? e.venue?.city ?? 'UK',
            lat: parseFloat(e.venue?.geo_lat ?? '0'),
            lng: parseFloat(e.venue?.geo_lng ?? '0'),
            starts_at: new Date(e.start_date).toISOString(),
            ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
            cost: e.cost ?? 'See event page',
          }))
        }
      }
    } catch {}

    // Strategy 2: Scrape HTML
    try {
      const res = await fetch(EVENTS_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return []
      const html = await res.text()

      const jsonLd = extractJsonLd(html, 'landworkers-uk')
      if (jsonLd.length > 0) return jsonLd

      return scrapeHtml(html)
    } catch (err) {
      console.warn('[landworkers-uk] failed:', (err as Error).message)
      return []
    }
  },
}

function scrapeHtml(html: string): RawEvent[] {
  const events: RawEvent[] = []
  // LWA uses tribe-events or standard WP event markup
  const pattern = /<(?:article|div)[^>]*class="[^"]*(?:tribe|event|type-tribe_events|post-type-tribe_events)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div)>/gi
  let match

  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*class="[^"]*tribe-events[^"]*"[^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
      || block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue

    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    const dateMatch = block.match(/datetime="([^"]*)"/) || block.match(/<abbr[^>]*title="([^"]*)"/)
    let startsAt = new Date().toISOString()
    if (dateMatch) {
      const parsed = new Date(dateMatch[1])
      if (!isNaN(parsed.getTime())) startsAt = parsed.toISOString()
    }

    const locMatch = block.match(/class="[^"]*tribe-venue[^"]*"[^>]*>([\s\S]*?)<\//i)

    events.push({
      source: 'landworkers-uk',
      source_id: `lwa-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], BASE).toString() : EVENTS_URL,
      title,
      description: 'Landworkers Alliance event — skill shares, farm open days, and regenerative agriculture.',
      organizer: 'Landworkers Alliance',
      location_name: locMatch ? stripHtml(locMatch[1]).trim() : 'UK',
      lat: 0, lng: 0,
      starts_at: startsAt,
      cost: 'See event page',
    })
  }

  return events
}
