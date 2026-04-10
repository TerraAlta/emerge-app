/**
 * Billetto event scraper.
 *
 * Searches https://billetto.co.uk/search for regenerative/community events.
 * Popular in Europe, especially Nordics and UK.
 * Extracts events from JSON-LD markup, falling back to HTML scraping.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const FETCH_TIMEOUT = 10_000

const KEYWORDS = [
  'permaculture',
  'repair cafe',
  'community garden',
  'foraging',
  'workshop',
  'seed swap',
  'fermentation',
  'folk session',
  'sustainability',
]

export const billetto: SourceFetcher = {
  name: 'billetto',

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
          console.log(`[billetto] "${keyword}" → ${events.length} events`)
        }
      } catch (err) {
        console.warn(`[billetto] "${keyword}" failed:`, (err as Error).message)
      }
    }

    console.log(`[billetto] Total: ${allEvents.length} unique events`)
    return allEvents
  },
}

async function scrapeSearch(keyword: string): Promise<RawEvent[]> {
  const url = `https://billetto.co.uk/search?q=${encodeURIComponent(keyword)}`

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
  const jsonLdEvents = extractJsonLd(html, 'billetto')
  if (jsonLdEvents.length > 0) return jsonLdEvents

  // Strategy 2: Try API-like JSON endpoint
  const apiEvents = await tryApiEndpoint(keyword)
  if (apiEvents.length > 0) return apiEvents

  // Strategy 3: HTML scraping fallback
  return extractFromHtml(html)
}

async function tryApiEndpoint(keyword: string): Promise<RawEvent[]> {
  try {
    const url = `https://billetto.co.uk/api/search?q=${encodeURIComponent(keyword)}&page=1`
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (!res.ok) return []

    const data = await res.json()
    const items = data?.events ?? data?.data ?? data?.results ?? []

    return items
      .filter((item: any) => item.name && item.start_date)
      .filter((item: any) => new Date(item.start_date) >= new Date())
      .map((item: any) => {
        const eventUrl = item.url ?? (item.slug ? `https://billetto.co.uk/e/${item.slug}` : null)
        return {
          source: 'billetto',
          source_id: `billetto-${hashStr(eventUrl ?? item.name + item.start_date)}`,
          source_url: eventUrl,
          title: stripHtml(item.name ?? item.title ?? ''),
          description: stripHtml(item.description ?? item.summary ?? '').slice(0, 500),
          organizer: item.organiser?.name ?? item.organizer?.name ?? 'Billetto Event',
          location_name: item.venue?.name ?? item.location?.name ?? item.address ?? 'See event page',
          lat: parseFloat(item.venue?.latitude ?? item.location?.lat ?? '0'),
          lng: parseFloat(item.venue?.longitude ?? item.location?.lng ?? '0'),
          starts_at: new Date(item.start_date).toISOString(),
          ends_at: item.end_date ? new Date(item.end_date).toISOString() : null,
          cost: item.is_free ? 'Free' : (item.min_price ? `${item.currency ?? '£'}${item.min_price}` : 'See event page'),
          image_url: item.image?.url ?? item.cover_image ?? null,
        } as RawEvent
      })
  } catch {
    return []
  }
}

function extractFromHtml(html: string): RawEvent[] {
  const events: RawEvent[] = []

  // Billetto uses event card links like /e/<slug>
  const pattern = /<a[^>]*href="(\/e\/[^"]+)"[^>]*>[\s\S]*?<(?:h\d|div|span)[^>]*>([\s\S]*?)<\/(?:h\d|div|span)>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null) {
    const [, path, rawTitle] = match
    const title = stripHtml(rawTitle)
    if (!title || title.length < 3) continue

    const eventUrl = `https://billetto.co.uk${path}`

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
      source: 'billetto',
      source_id: `billetto-${hashStr(eventUrl)}`,
      source_url: eventUrl,
      title,
      description: '',
      organizer: 'Billetto Event',
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
