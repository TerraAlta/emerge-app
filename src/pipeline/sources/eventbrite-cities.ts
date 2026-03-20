/**
 * Eventbrite city-based event scraper.
 *
 * Loops through 50 cities × top keywords, scraping Eventbrite search results.
 * Extracts events from JSON-LD markup on the page, falling back to the
 * Eventbrite API-like search endpoint.
 *
 * Rate-limited to 1 request/second to avoid blocking.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { CITIES } from './cities'
import { KEYWORDS, MAX_KEYWORDS_PER_CITY } from './keywords'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const FETCH_TIMEOUT = 10_000
const RATE_LIMIT_MS = 1_000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Map country names to Eventbrite URL slugs */
function countrySlug(country: string): string {
  const map: Record<string, string> = {
    'Portugal': 'portugal',
    'Germany': 'germany',
    'Netherlands': 'netherlands',
    'United Kingdom': 'united-kingdom',
    'France': 'france',
    'Belgium': 'belgium',
    'Spain': 'spain',
    'Italy': 'italy',
    'Switzerland': 'switzerland',
    'Malta': 'malta',
    'Finland': 'finland',
    'Canada': 'canada',
    'United States': 'united-states',
  }
  return map[country] ?? country.toLowerCase().replace(/\s+/g, '-')
}

export const eventbriteCities: SourceFetcher = {
  name: 'eventbrite-cities',

  async fetch() {
    const seen = new Set<string>()
    const allEvents: RawEvent[] = []
    const keywords = KEYWORDS.slice(0, MAX_KEYWORDS_PER_CITY)

    for (const city of CITIES) {
      for (const keyword of keywords) {
        try {
          const events = await scrapeEventbriteSearch(city.name, city.country, keyword, city.lat, city.lng)
          let added = 0
          for (const ev of events) {
            const key = ev.source_url ?? ev.source_id
            if (seen.has(key)) continue
            seen.add(key)
            allEvents.push(ev)
            added++
          }
          if (events.length > 0) {
            console.log(`[eventbrite-cities] ${city.name}: "${keyword}" → ${added} events`)
          }
        } catch (err) {
          console.warn(`[eventbrite-cities] ${city.name}: "${keyword}" failed:`, (err as Error).message)
        }
        await sleep(RATE_LIMIT_MS)
      }
    }

    console.log(`[eventbrite-cities] Total: ${allEvents.length} unique events from ${CITIES.length} cities`)
    return allEvents
  },
}

async function scrapeEventbriteSearch(
  cityName: string,
  country: string,
  keyword: string,
  fallbackLat: number,
  fallbackLng: number,
): Promise<RawEvent[]> {
  const slug = countrySlug(country)
  const citySlug = cityName.toLowerCase().replace(/\s+/g, '-')
  const keywordSlug = keyword.replace(/\s+/g, '-')
  const url = `https://www.eventbrite.com/d/${slug}--${citySlug}/${keywordSlug}/`

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })

  if (!res.ok) {
    // Fallback to API-like endpoint
    return await tryApiEndpoint(cityName, keyword, fallbackLat, fallbackLng)
  }

  const html = await res.text()

  // Strategy 1: Extract JSON-LD events using shared utility
  const jsonLdEvents = extractJsonLd(html, 'eventbrite-cities')
  if (jsonLdEvents.length > 0) {
    // Patch source_id format and apply fallback coords
    return jsonLdEvents.map(ev => ({
      ...ev,
      source_id: `eventbrite-${hashStr(ev.source_url ?? ev.title + ev.starts_at)}`,
      lat: ev.lat || fallbackLat,
      lng: ev.lng || fallbackLng,
    }))
  }

  // Strategy 2: Parse embedded search result data
  const embeddedEvents = extractEmbeddedData(html, fallbackLat, fallbackLng)
  if (embeddedEvents.length > 0) return embeddedEvents

  // Strategy 3: Fallback to API
  return await tryApiEndpoint(cityName, keyword, fallbackLat, fallbackLng)
}

/**
 * Extract events from Eventbrite's embedded __SERVER_DATA__ or window.__SERVER_DATA__
 */
function extractEmbeddedData(html: string, fallbackLat: number, fallbackLng: number): RawEvent[] {
  const patterns = [
    /window\.__SERVER_DATA__\s*=\s*(\{[\s\S]*?\});/,
    /"search_data"\s*:\s*(\{[\s\S]*?\})\s*[,}]/,
    /data-search-results="([^"]*?)"/,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (!match?.[1]) continue

    try {
      let jsonStr = match[1]
      // Handle HTML-encoded JSON in data attributes
      if (pattern.source.includes('data-search')) {
        jsonStr = jsonStr.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      }

      const data = JSON.parse(jsonStr)
      const events = findEventbriteEvents(data)

      return events.map(item => {
        const eventUrl = item.url ?? item.primary_venue_link ?? null
        return {
          source: 'eventbrite-cities',
          source_id: `eventbrite-${hashStr(eventUrl ?? item.name + item.start_date)}`,
          source_url: eventUrl,
          title: stripHtml(item.name ?? item.title ?? ''),
          description: stripHtml(item.summary ?? item.description ?? '').slice(0, 500),
          organizer: item.organizer?.name ?? item.primary_organizer?.name ?? 'Eventbrite Organizer',
          location_name: item.primary_venue?.name ?? item.venue?.name ?? 'See event page',
          lat: item.primary_venue?.latitude ?? item.venue?.latitude ?? fallbackLat,
          lng: item.primary_venue?.longitude ?? item.venue?.longitude ?? fallbackLng,
          starts_at: new Date(item.start_date ?? item.start?.utc ?? item.starts_at).toISOString(),
          ends_at: (item.end_date ?? item.end?.utc) ? new Date(item.end_date ?? item.end.utc).toISOString() : null,
          cost: item.ticket_availability?.is_free ? 'Free' : (item.ticket_availability?.minimum_ticket_price?.display ?? 'See event page'),
          image_url: item.image?.url ?? item.logo?.url ?? null,
        } as RawEvent
      }).filter(ev => new Date(ev.starts_at) >= new Date())
    } catch {
      continue
    }
  }

  return []
}

/**
 * Recursively find event-like objects in Eventbrite's data structure.
 */
function findEventbriteEvents(obj: any, depth = 0): any[] {
  if (depth > 8 || !obj || typeof obj !== 'object') return []

  // Check for event-like object
  if (obj.name && (obj.start_date || obj.start?.utc)) {
    return [obj]
  }

  const results: any[] = []

  if (Array.isArray(obj)) {
    for (const item of obj) {
      results.push(...findEventbriteEvents(item, depth + 1))
    }
  } else {
    for (const key of ['events', 'results', 'search_events', 'event_results', 'bucketed_events']) {
      if (obj[key]) {
        results.push(...findEventbriteEvents(obj[key], depth + 1))
      }
    }
  }

  return results
}

async function tryApiEndpoint(
  cityName: string,
  keyword: string,
  fallbackLat: number,
  fallbackLng: number,
): Promise<RawEvent[]> {
  try {
    const url = `https://www.eventbrite.com/api/v3/destination/search/`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        event_search: {
          q: keyword,
          dates: 'current_future',
          places: [{
            latitude: fallbackLat,
            longitude: fallbackLng,
            within: '50km',
          }],
          page: 1,
          page_size: 20,
        },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (!res.ok) return []

    const data = await res.json()
    const items = data?.events?.results ?? data?.events ?? []

    return items
      .filter((item: any) => item.name && (item.start_date || item.start?.utc))
      .filter((item: any) => new Date(item.start_date ?? item.start?.utc) >= new Date())
      .map((item: any) => {
        const eventUrl = item.url ?? `https://www.eventbrite.com/e/${item.id}`
        return {
          source: 'eventbrite-cities',
          source_id: `eventbrite-${hashStr(eventUrl)}`,
          source_url: eventUrl,
          title: stripHtml(item.name ?? ''),
          description: stripHtml(item.summary ?? item.description?.text ?? '').slice(0, 500),
          organizer: item.organizer?.name ?? 'Eventbrite Organizer',
          location_name: item.venue?.name ?? item.venue?.address?.city ?? cityName,
          lat: parseFloat(item.venue?.latitude ?? '0') || fallbackLat,
          lng: parseFloat(item.venue?.longitude ?? '0') || fallbackLng,
          starts_at: new Date(item.start_date ?? item.start?.utc).toISOString(),
          ends_at: (item.end_date ?? item.end?.utc) ? new Date(item.end_date ?? item.end.utc).toISOString() : null,
          cost: item.is_free ? 'Free' : 'See event page',
          image_url: item.logo?.url ?? item.image?.url ?? null,
        } as RawEvent
      })
  } catch {
    return []
  }
}
