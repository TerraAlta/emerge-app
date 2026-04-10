/**
 * Ticket Tailor event scraper.
 *
 * Searches https://www.tickettailor.com/discover/ for regenerative community events.
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
]

export const ticketTailor: SourceFetcher = {
  name: 'ticket-tailor',

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
          console.log(`[ticket-tailor] "${keyword}" → ${events.length} events`)
        }
      } catch (err) {
        console.warn(`[ticket-tailor] "${keyword}" failed:`, (err as Error).message)
      }
    }

    console.log(`[ticket-tailor] Total: ${allEvents.length} unique events`)
    return allEvents
  },
}

async function scrapeSearch(keyword: string): Promise<RawEvent[]> {
  const url = `https://www.tickettailor.com/discover/?q=${encodeURIComponent(keyword)}`

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
  const jsonLdEvents = extractJsonLd(html, 'ticket-tailor')
  if (jsonLdEvents.length > 0) return jsonLdEvents

  // Strategy 2: HTML scraping fallback — look for event cards
  return extractFromHtml(html)
}

function extractFromHtml(html: string): RawEvent[] {
  const events: RawEvent[] = []

  // Look for event card patterns — Ticket Tailor uses various markup patterns
  const cardPattern = /<a[^>]*href="(\/events\/[^"]+)"[^>]*>[\s\S]*?<h\d[^>]*>([\s\S]*?)<\/h\d>/g
  let match: RegExpExecArray | null

  while ((match = cardPattern.exec(html)) !== null) {
    const [, path, rawTitle] = match
    const title = stripHtml(rawTitle)
    if (!title) continue

    const eventUrl = `https://www.tickettailor.com${path}`

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

    // Skip past events
    if (new Date(startsAt) < new Date()) continue

    events.push({
      source: 'ticket-tailor',
      source_id: `ticket-tailor-${hashStr(eventUrl)}`,
      source_url: eventUrl,
      title,
      description: '',
      organizer: 'Ticket Tailor Event',
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
