/**
 * DICE event scraper.
 *
 * Searches https://dice.fm for music/culture community events.
 * DICE is focused on music, arts, and cultural events.
 * Extracts events from JSON-LD markup, falling back to HTML scraping.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const FETCH_TIMEOUT = 10_000

const KEYWORDS = [
  'folk',
  'acoustic',
  'community',
  'jam session',
  'open mic',
  'folk session',
  'world music',
  'traditional',
]

export const dice: SourceFetcher = {
  name: 'dice',

  async fetch() {
    const seen = new Set<string>()
    const allEvents: RawEvent[] = []

    for (const keyword of KEYWORDS) {
      try {
        const events = await scrapeSearch(keyword)
        for (const ev of events) {
          const key = ev.source_url ?? ev.source_id
          if (seen.has(key)) continue
          seen.add(key)
          allEvents.push(ev)
        }
        if (events.length > 0) {
          console.log(`[dice] "${keyword}" → ${events.length} events`)
        }
      } catch (err) {
        console.warn(`[dice] "${keyword}" failed:`, (err as Error).message)
      }
    }

    console.log(`[dice] Total: ${allEvents.length} unique events`)
    return allEvents
  },
}

async function scrapeSearch(keyword: string): Promise<RawEvent[]> {
  // DICE search page
  const url = `https://dice.fm/search?query=${encodeURIComponent(keyword)}`

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })

  if (!res.ok) return []

  const html = await res.text()

  // Strategy 1: JSON-LD extraction
  const jsonLdEvents = extractJsonLd(html, 'dice')
  if (jsonLdEvents.length > 0) return jsonLdEvents

  // Strategy 2: Try DICE's GraphQL/API endpoint
  const apiEvents = await tryDiceApi(keyword)
  if (apiEvents.length > 0) return apiEvents

  // Strategy 3: HTML scraping fallback
  return extractFromHtml(html)
}

async function tryDiceApi(keyword: string): Promise<RawEvent[]> {
  try {
    // DICE uses a GraphQL API for search results
    const url = `https://api.dice.fm/search?query=${encodeURIComponent(keyword)}&type=events`
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (!res.ok) return []

    const data = await res.json()
    const items = data?.events ?? data?.data?.events ?? data?.hits ?? data?.results ?? []

    return items
      .filter((item: any) => item.name && (item.date || item.start_date || item.starts_at))
      .filter((item: any) => new Date(item.date ?? item.start_date ?? item.starts_at) >= new Date())
      .map((item: any) => {
        const startDate = item.date ?? item.start_date ?? item.starts_at
        const eventUrl = item.url ?? (item.slug ? `https://dice.fm/event/${item.slug}` : null)
        const venue = item.venue ?? item.location ?? {}
        return {
          source: 'dice',
          source_id: `dice-${hashStr(eventUrl ?? item.name + startDate)}`,
          source_url: eventUrl,
          title: stripHtml(item.name ?? item.title ?? ''),
          description: stripHtml(item.description ?? item.summary ?? item.about ?? '').slice(0, 500),
          organizer: item.promoter?.name ?? item.artist?.name ?? 'DICE Event',
          location_name: venue.name ?? venue.address ?? 'See event page',
          lat: parseFloat(venue.latitude ?? venue.lat ?? '0'),
          lng: parseFloat(venue.longitude ?? venue.lng ?? '0'),
          starts_at: new Date(startDate).toISOString(),
          ends_at: item.end_date ? new Date(item.end_date).toISOString() : null,
          cost: item.is_free ? 'Free' : (item.price ? `£${(item.price / 100).toFixed(2)}` : 'See event page'),
          image_url: item.image ?? item.artwork ?? item.cover_image ?? null,
        } as RawEvent
      })
  } catch {
    return []
  }
}

function extractFromHtml(html: string): RawEvent[] {
  const events: RawEvent[] = []

  // DICE event links use /event/<slug> or /events/<slug>
  const pattern = /<a[^>]*href="(\/events?\/[^"]+)"[^>]*>[\s\S]*?<(?:h\d|div|span|p)[^>]*>([\s\S]*?)<\/(?:h\d|div|span|p)>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null) {
    const [, path, rawTitle] = match
    const title = stripHtml(rawTitle)
    if (!title || title.length < 3) continue

    const eventUrl = `https://dice.fm${path}`

    // Try to find a date near this card
    const dateMatch = html.slice(match.index, match.index + 1000).match(
      /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i
    )
    let startsAt: string
    try {
      startsAt = dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
    } catch {
      startsAt = new Date().toISOString()
    }

    if (new Date(startsAt) < new Date()) continue

    events.push({
      source: 'dice',
      source_id: `dice-${hashStr(eventUrl)}`,
      source_url: eventUrl,
      title,
      description: '',
      organizer: 'DICE Event',
      location_name: 'See event page',
      lat: 0,
      lng: 0,
      starts_at: startsAt,
      ends_at: null,
      cost: 'See event page',
      image_url: null,
    })
  }

  return events
}
