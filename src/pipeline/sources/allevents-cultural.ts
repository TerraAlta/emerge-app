/**
 * Allevents.in cultural events scraper.
 *
 * Scrapes the cultural-events category from allevents.in for each pipeline city.
 * Strong for diaspora and cultural celebration events — Nowruz feasts, community
 * iftars, Diwali gatherings, Caribbean events, African community dinners.
 *
 * Rate-limited to 2s between requests to respect the site.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { CITIES } from './cities'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const FETCH_TIMEOUT = 12_000
const RATE_LIMIT_MS = 2_000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Categories to scrape from allevents.in */
const CATEGORIES = [
  'cultural-events',
  'food-and-drink',
  'community',
]

/** Map city names to allevents.in URL slugs */
function citySlug(name: string): string {
  return name.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[àáâã]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9-]/g, '')
}

export const alleventsCultural: SourceFetcher = {
  name: 'allevents-cultural',

  async fetch() {
    const seen = new Set<string>()
    const allEvents: RawEvent[] = []

    for (const city of CITIES) {
      for (const category of CATEGORIES) {
        try {
          const events = await scrapeAlleventsCategory(city.name, city.lat, city.lng, category)
          let added = 0
          for (const ev of events) {
            const key = ev.source_url ?? ev.source_id
            if (seen.has(key)) continue
            seen.add(key)
            allEvents.push(ev)
            added++
          }
          if (added > 0) {
            console.log(`[allevents-cultural] ${city.name}/${category} → ${added} events`)
          }
        } catch (err) {
          // Many cities won't have pages — that's fine
          if ((err as Error).message?.includes('404')) continue
          console.warn(`[allevents-cultural] ${city.name}/${category} failed:`, (err as Error).message)
        }
        await sleep(RATE_LIMIT_MS)
      }
    }

    console.log(`[allevents-cultural] Total: ${allEvents.length} unique events`)
    return allEvents
  },
}

async function scrapeAlleventsCategory(
  cityName: string,
  fallbackLat: number,
  fallbackLng: number,
  category: string,
): Promise<RawEvent[]> {
  const slug = citySlug(cityName)
  const url = `https://allevents.in/${slug}/${category}`

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })

  if (!res.ok) {
    if (res.status === 404) throw new Error('404')
    return []
  }

  const html = await res.text()

  // Strategy 1: JSON-LD extraction
  const jsonLdEvents = extractJsonLd(html, 'allevents-cultural')
  if (jsonLdEvents.length > 0) {
    return jsonLdEvents.map(ev => ({
      ...ev,
      source: 'allevents-cultural',
      source_id: `allevents-${hashStr(ev.source_url ?? ev.title + ev.starts_at)}`,
      lat: ev.lat || fallbackLat,
      lng: ev.lng || fallbackLng,
    }))
  }

  // Strategy 2: Parse event cards from HTML
  return extractEventCards(html, cityName, fallbackLat, fallbackLng)
}

/**
 * Extract events from allevents.in HTML event cards.
 * Cards typically have: data-event-id, event title, date, venue, URL.
 */
function extractEventCards(
  html: string,
  cityName: string,
  fallbackLat: number,
  fallbackLng: number,
): RawEvent[] {
  const events: RawEvent[] = []

  // Pattern 1: Event card links with structured data
  const cardPattern = /<a[^>]*href="(https:\/\/allevents\.in\/[^"]*)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<(?:time|span)[^>]*class="[^"]*date[^"]*"[^>]*>([\s\S]*?)<\/(?:time|span)>[\s\S]*?(?:<span[^>]*class="[^"]*venue[^"]*"[^>]*>([\s\S]*?)<\/span>)?/gi

  let match
  while ((match = cardPattern.exec(html)) !== null) {
    const [, eventUrl, rawTitle, rawDate, rawVenue] = match
    const title = stripHtml(rawTitle)
    const dateStr = stripHtml(rawDate)
    const venue = rawVenue ? stripHtml(rawVenue) : cityName

    if (!title || !dateStr) continue

    // Try to parse the date
    const parsed = parseAlleventsDate(dateStr)
    if (!parsed || parsed < new Date()) continue

    events.push({
      source: 'allevents-cultural',
      source_id: `allevents-${hashStr(eventUrl)}`,
      source_url: eventUrl,
      title,
      description: '', // Will be filled by AI scoring from title + context
      organizer: 'AllEvents',
      location_name: venue,
      lat: fallbackLat,
      lng: fallbackLng,
      starts_at: parsed.toISOString(),
      ends_at: null,
      cost: 'See event page',
      image_url: null,
    })
  }

  // Pattern 2: Simpler event listing (li elements)
  if (events.length === 0) {
    const simplePattern = /<li[^>]*class="[^"]*event[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<time[^>]*datetime="([^"]*)"[^>]*>/gi
    while ((match = simplePattern.exec(html)) !== null) {
      const [, url, rawTitle, datetime] = match
      const title = stripHtml(rawTitle)
      if (!title) continue

      const eventUrl = url.startsWith('http') ? url : `https://allevents.in${url}`
      const date = new Date(datetime)
      if (isNaN(date.getTime()) || date < new Date()) continue

      events.push({
        source: 'allevents-cultural',
        source_id: `allevents-${hashStr(eventUrl)}`,
        source_url: eventUrl,
        title,
        description: '',
        organizer: 'AllEvents',
        location_name: cityName,
        lat: fallbackLat,
        lng: fallbackLng,
        starts_at: date.toISOString(),
        ends_at: null,
        cost: 'See event page',
        image_url: null,
      })
    }
  }

  return events
}

/** Parse date strings from allevents.in (various formats) */
function parseAlleventsDate(dateStr: string): Date | null {
  // Try standard Date.parse first
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) return d

  // Try "Mon DD, YYYY" or "DD Mon YYYY"
  const cleaned = dateStr.replace(/,/g, '').trim()
  const d2 = new Date(cleaned)
  if (!isNaN(d2.getTime())) return d2

  return null
}
