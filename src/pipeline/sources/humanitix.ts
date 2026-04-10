/**
 * Humanitix event scraper.
 *
 * Searches https://humanitix.com/search for regenerative/community events.
 * Humanitix is popular with nonprofits and social enterprises.
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
  'sustainability',
  'regenerative',
]

export const humanitix: SourceFetcher = {
  name: 'humanitix',

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
          console.log(`[humanitix] "${keyword}" → ${events.length} events`)
        }
      } catch (err) {
        console.warn(`[humanitix] "${keyword}" failed:`, (err as Error).message)
      }
    }

    console.log(`[humanitix] Total: ${allEvents.length} unique events`)
    return allEvents
  },
}

async function scrapeSearch(keyword: string): Promise<RawEvent[]> {
  const url = `https://humanitix.com/search?q=${encodeURIComponent(keyword)}`

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
  const jsonLdEvents = extractJsonLd(html, 'humanitix')
  if (jsonLdEvents.length > 0) return jsonLdEvents

  // Strategy 2: Try embedded JSON data (Next.js __NEXT_DATA__ or similar)
  const nextDataEvents = extractNextData(html)
  if (nextDataEvents.length > 0) return nextDataEvents

  // Strategy 3: HTML scraping fallback
  return extractFromHtml(html)
}

function extractNextData(html: string): RawEvent[] {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match?.[1]) return []

  try {
    const data = JSON.parse(match[1])
    const events = findEvents(data, 0)
    return events
      .filter(ev => new Date(ev.starts_at) >= new Date())
  } catch {
    return []
  }
}

function findEvents(obj: any, depth: number): RawEvent[] {
  if (depth > 8 || !obj || typeof obj !== 'object') return []

  // Humanitix event shape
  if (obj.name && (obj.startDate || obj.startTime || obj.dates?.[0])) {
    const eventUrl = obj.slug
      ? `https://humanitix.com/event/${obj.slug}`
      : obj.url ?? null
    const startDate = obj.startDate ?? obj.dates?.[0]?.startDate ?? obj.startTime
    return [{
      source: 'humanitix',
      source_id: `humanitix-${hashStr(eventUrl ?? obj.name + startDate)}`,
      source_url: eventUrl,
      title: stripHtml(obj.name ?? obj.title ?? ''),
      description: stripHtml(obj.description ?? obj.summary ?? '').slice(0, 500),
      organizer: obj.organiser?.name ?? obj.organizer?.name ?? 'Humanitix Event',
      location_name: obj.location?.name ?? obj.venue?.name ?? obj.location?.address ?? 'See event page',
      lat: parseFloat(obj.location?.latitude ?? obj.venue?.latitude ?? '0'),
      lng: parseFloat(obj.location?.longitude ?? obj.venue?.longitude ?? '0'),
      starts_at: new Date(startDate).toISOString(),
      ends_at: obj.endDate ? new Date(obj.endDate).toISOString() : null,
      cost: obj.isFree ? 'Free' : (obj.lowestTicketPrice ? `$${obj.lowestTicketPrice}` : 'See event page'),
      image_url: obj.image ?? obj.bannerImage ?? null,
    }]
  }

  const results: RawEvent[] = []
  if (Array.isArray(obj)) {
    for (const item of obj) results.push(...findEvents(item, depth + 1))
  } else {
    for (const key of ['events', 'results', 'data', 'props', 'pageProps', 'searchResults']) {
      if (obj[key]) results.push(...findEvents(obj[key], depth + 1))
    }
  }
  return results
}

function extractFromHtml(html: string): RawEvent[] {
  const events: RawEvent[] = []

  // Look for event links with typical Humanitix patterns
  const pattern = /<a[^>]*href="(\/(?:event|e)\/[^"]+)"[^>]*>[\s\S]*?<(?:h\d|div|span)[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/(?:h\d|div|span)>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null) {
    const [, path, rawTitle] = match
    const title = stripHtml(rawTitle)
    if (!title) continue

    const eventUrl = `https://humanitix.com${path}`

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
      source: 'humanitix',
      source_id: `humanitix-${hashStr(eventUrl)}`,
      source_url: eventUrl,
      title,
      description: '',
      organizer: 'Humanitix Event',
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
