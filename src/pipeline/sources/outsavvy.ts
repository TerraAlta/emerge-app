/**
 * Outsavvy event scraper.
 *
 * Searches https://www.outsavvy.com/search for UK community events.
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
  'regenerative',
]

export const outsavvy: SourceFetcher = {
  name: 'outsavvy',

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
          console.log(`[outsavvy] "${keyword}" → ${events.length} events`)
        }
      } catch (err) {
        console.warn(`[outsavvy] "${keyword}" failed:`, (err as Error).message)
      }
    }

    console.log(`[outsavvy] Total: ${allEvents.length} unique events`)
    return allEvents
  },
}

async function scrapeSearch(keyword: string): Promise<RawEvent[]> {
  const url = `https://www.outsavvy.com/search?q=${encodeURIComponent(keyword)}`

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
  const jsonLdEvents = extractJsonLd(html, 'outsavvy')
  if (jsonLdEvents.length > 0) return jsonLdEvents

  // Strategy 2: Try embedded data (Outsavvy may embed event data in script tags)
  const embeddedEvents = extractEmbeddedData(html)
  if (embeddedEvents.length > 0) return embeddedEvents

  // Strategy 3: HTML scraping fallback
  return extractFromHtml(html)
}

function extractEmbeddedData(html: string): RawEvent[] {
  // Look for server-rendered event data in script tags
  const patterns = [
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/,
    /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});/,
    /"events"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (!match?.[1]) continue

    try {
      const data = JSON.parse(match[1])
      const items = Array.isArray(data) ? data : data.events ?? data.results ?? []

      return items
        .filter((item: any) => item.name && (item.start_date || item.startDate || item.date))
        .filter((item: any) => new Date(item.start_date ?? item.startDate ?? item.date) >= new Date())
        .map((item: any) => {
          const startDate = item.start_date ?? item.startDate ?? item.date
          const eventUrl = item.url ?? (item.slug ? `https://www.outsavvy.com/event/${item.slug}` : null)
          return {
            source: 'outsavvy',
            source_id: `outsavvy-${hashStr(eventUrl ?? item.name + startDate)}`,
            source_url: eventUrl,
            title: stripHtml(item.name ?? item.title ?? ''),
            description: stripHtml(item.description ?? item.summary ?? '').slice(0, 500),
            organizer: item.organiser?.name ?? item.organizer?.name ?? 'Outsavvy Event',
            location_name: item.venue?.name ?? item.location ?? 'See event page',
            lat: parseFloat(item.venue?.latitude ?? item.lat ?? '0'),
            lng: parseFloat(item.venue?.longitude ?? item.lng ?? '0'),
            starts_at: new Date(startDate).toISOString(),
            ends_at: item.end_date ? new Date(item.end_date).toISOString() : null,
            cost: item.is_free ? 'Free' : (item.min_price ? `£${item.min_price}` : 'See event page'),
            image_url: item.image ?? item.cover_image ?? null,
          } as RawEvent
        })
    } catch {
      continue
    }
  }

  return []
}

function extractFromHtml(html: string): RawEvent[] {
  const events: RawEvent[] = []

  // Outsavvy event links typically use /event/<slug>
  const pattern = /<a[^>]*href="(\/event\/[^"]+)"[^>]*>[\s\S]*?<(?:h\d|div|span)[^>]*>([\s\S]*?)<\/(?:h\d|div|span)>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null) {
    const [, path, rawTitle] = match
    const title = stripHtml(rawTitle)
    if (!title || title.length < 3) continue

    const eventUrl = `https://www.outsavvy.com${path}`

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
      source: 'outsavvy',
      source_id: `outsavvy-${hashStr(eventUrl)}`,
      source_url: eventUrl,
      title,
      description: '',
      organizer: 'Outsavvy Event',
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
