/**
 * Meetup city-based event scraper.
 *
 * Loops through 50 cities × top keywords, scraping Meetup search results.
 * Extracts events from __NEXT_DATA__ JSON embedded in the page, falling back
 * to JSON-LD extraction.
 *
 * Rate-limited to 1 request/second to avoid blocking.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { CITIES } from './cities'
import { getKeywordsForCity, getCityBatch } from './keyword-selector'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const FETCH_TIMEOUT = 10_000
const RATE_LIMIT_MS = 1_000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const meetupCities: SourceFetcher = {
  name: 'meetup-cities',
  bulk: true,

  async fetch() {
    const seen = new Set<string>()
    const allEvents: RawEvent[] = []
    const batch = getCityBatch(CITIES, 20)

    for (const city of batch) {
      const keywords = getKeywordsForCity(city)
      for (const keyword of keywords) {
        try {
          const events = await scrapeMeetupSearch(city.name, city.country, keyword, city.lat, city.lng)
          let added = 0
          for (const ev of events) {
            if (seen.has(ev.source_url!)) continue
            seen.add(ev.source_url!)
            allEvents.push(ev)
            added++
          }
          if (events.length > 0) {
            console.log(`[meetup-cities] ${city.name}: "${keyword}" → ${added} events`)
          }
        } catch (err) {
          console.warn(`[meetup-cities] ${city.name}: "${keyword}" failed:`, (err as Error).message)
        }
        await sleep(RATE_LIMIT_MS)
      }
    }

    console.log(`[meetup-cities] Total: ${allEvents.length} unique events from ${CITIES.length} cities`)
    return allEvents
  },
}

async function scrapeMeetupSearch(
  cityName: string,
  country: string,
  keyword: string,
  fallbackLat: number,
  fallbackLng: number,
): Promise<RawEvent[]> {
  const location = `${cityName}, ${country}`
  const url = `https://www.meetup.com/find/?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&source=EVENTS&eventType=inPerson`

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

  // Strategy 1: Parse __NEXT_DATA__ (Meetup's Next.js embedded data)
  const nextDataEvents = extractFromNextData(html, fallbackLat, fallbackLng)

  // Strategy 2: Extract JSON-LD (may find additional events)
  const jsonLdEvents = extractJsonLdEvents(html, fallbackLat, fallbackLng)

  // Combine both strategies, dedup by URL
  const seen = new Set<string>()
  const combined: RawEvent[] = []
  for (const ev of [...nextDataEvents, ...jsonLdEvents]) {
    if (ev.source_url && seen.has(ev.source_url)) continue
    if (ev.source_url) seen.add(ev.source_url)
    combined.push(ev)
  }
  if (combined.length > 0) return combined

  // Strategy 3: Try the GraphQL endpoint
  return await tryGraphQLEndpoint(cityName, keyword, fallbackLat, fallbackLng)
}

function extractFromNextData(html: string, fallbackLat: number, fallbackLng: number): RawEvent[] {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match?.[1]) return []

  try {
    const nextData = JSON.parse(match[1])
    const events: RawEvent[] = []

    // First check Apollo state directly — scan all entries for Event type
    const apollo = nextData?.props?.pageProps?.__APOLLO_STATE__
    let results: any[] = []
    if (apollo) {
      for (const val of Object.values(apollo)) {
        if ((val as any)?.__typename === 'Event') results.push(val)
      }
    }
    // Fallback: navigate the __NEXT_DATA__ structure recursively
    if (results.length === 0) results = findEventsInObject(nextData)

    for (const item of results) {
      if (!item.dateTime) continue
      // Skip past events
      if (new Date(item.dateTime) < new Date()) continue

      const eventUrl = item.eventUrl ?? item.link ?? null
      if (!eventUrl) continue

      const fullUrl = eventUrl.startsWith('http') ? eventUrl : `https://www.meetup.com${eventUrl}`

      // Apollo Event objects may have a date as 'title' — use group name + date as fallback
      const title = (item.title && !/^\w+ \d/.test(item.title)) ? item.title : item.name ?? item.group?.name ?? item.title
      const venueLat = item.venue?.lat ?? item.venue?.latitude ?? fallbackLat
      const venueLng = item.venue?.lng ?? item.venue?.longitude ?? fallbackLng

      events.push({
        source: 'meetup-cities',
        source_id: `meetup-${hashStr(fullUrl)}`,
        source_url: fullUrl,
        title: stripHtml(title ?? 'Meetup Event'),
        description: stripHtml(item.description ?? item.shortDescription ?? '').slice(0, 500),
        organizer: item.group?.name ?? item.organizer ?? 'Meetup Group',
        location_name: item.venue?.name ?? item.venue?.address ?? 'See event page',
        lat: parseFloat(String(venueLat)) || fallbackLat,
        lng: parseFloat(String(venueLng)) || fallbackLng,
        starts_at: new Date(item.dateTime).toISOString(),
        ends_at: item.endTime ? new Date(item.endTime).toISOString() : null,
        cost: item.feeSettings?.amount ? `${item.feeSettings.currency ?? ''}${item.feeSettings.amount}` : 'Free',
        image_url: item.imageUrl ?? item.featuredPhoto?.highResUrl ?? null,
        max_participants: item.rsvpLimit ?? null,
      })
    }

    return events
  } catch {
    return []
  }
}

/**
 * Recursively search an object for arrays of event-like objects.
 * Meetup's __NEXT_DATA__ structure varies — this finds event nodes wherever they are.
 */
function findEventsInObject(obj: any, depth = 0): any[] {
  if (depth > 10 || !obj || typeof obj !== 'object') return []

  // Check if this is an event-like object
  if (obj.title && (obj.dateTime || obj.startDate || obj.time)) {
    return [obj]
  }

  const results: any[] = []

  if (Array.isArray(obj)) {
    for (const item of obj) {
      results.push(...findEventsInObject(item, depth + 1))
    }
  } else {
    // Look for known Meetup keys
    for (const key of ['edges', 'results', 'events', 'upcomingEvents', 'rankedEvents', 'searchResults']) {
      if (obj[key]) {
        results.push(...findEventsInObject(obj[key], depth + 1))
      }
    }
    // Check "node" patterns (Apollo-style edges)
    if (obj.node) {
      results.push(...findEventsInObject(obj.node, depth + 1))
    }
    // Check pageProps and other Next.js structures
    if (obj.pageProps) {
      results.push(...findEventsInObject(obj.pageProps, depth + 1))
    }
    if (obj.props) {
      results.push(...findEventsInObject(obj.props, depth + 1))
    }
    if (obj.__APOLLO_STATE__) {
      // Apollo cache: look for Event-typed entries
      for (const [, val] of Object.entries(obj.__APOLLO_STATE__)) {
        if ((val as any)?.__typename === 'Event') {
          results.push(val)
        }
      }
    }
  }

  return results
}

function extractJsonLdEvents(html: string, fallbackLat: number, fallbackLng: number): RawEvent[] {
  const events: RawEvent[] = []
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? []

  for (const block of blocks) {
    try {
      const json = block.replace(/<\/?script[^>]*>/g, '').trim()
      const data = JSON.parse(json)
      const items = Array.isArray(data) ? data : data['@graph'] ?? [data]

      for (const item of items) {
        if (item['@type'] !== 'Event') continue
        if (!item.name || !item.startDate) continue
        if (new Date(item.startDate) < new Date()) continue

        const loc = item.location ?? {}
        const geo = loc.geo ?? {}
        const eventUrl = item.url ?? null

        events.push({
          source: 'meetup-cities',
          source_id: `meetup-${hashStr(eventUrl ?? item.name + item.startDate)}`,
          source_url: eventUrl,
          title: stripHtml(item.name),
          description: stripHtml(item.description ?? '').slice(0, 500),
          organizer: item.organizer?.name ?? 'Meetup Group',
          location_name: loc.name ?? loc.address?.addressLocality ?? 'See event page',
          lat: parseFloat(geo.latitude ?? '0') || fallbackLat,
          lng: parseFloat(geo.longitude ?? '0') || fallbackLng,
          starts_at: new Date(item.startDate).toISOString(),
          ends_at: item.endDate ? new Date(item.endDate).toISOString() : null,
          cost: item.isAccessibleForFree ? 'Free' : (item.offers?.price ? `${item.offers.priceCurrency ?? ''}${item.offers.price}` : 'See event page'),
          image_url: typeof item.image === 'string' ? item.image : item.image?.url ?? null,
        })
      }
    } catch { /* skip malformed */ }
  }

  return events
}

async function tryGraphQLEndpoint(
  cityName: string,
  keyword: string,
  fallbackLat: number,
  fallbackLng: number,
): Promise<RawEvent[]> {
  try {
    const res = await fetch('https://www.meetup.com/gql2', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        operationName: 'categorySearch',
        variables: {
          first: 20,
          lat: fallbackLat,
          lon: fallbackLng,
          radius: 50,
          query: keyword,
          source: 'EVENTS',
          eventType: 'PHYSICAL',
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: 'needsDiscovery',
          },
        },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (!res.ok) return []

    const data = await res.json()
    const edges = data?.data?.rankedEvents?.edges ?? data?.data?.results?.edges ?? []
    const events: RawEvent[] = []

    for (const edge of edges) {
      const node = edge.node ?? edge
      if (!node.title || !node.dateTime) continue
      if (new Date(node.dateTime) < new Date()) continue

      const eventUrl = node.eventUrl ?? ''
      const fullUrl = eventUrl.startsWith('http') ? eventUrl : `https://www.meetup.com${eventUrl}`

      events.push({
        source: 'meetup-cities',
        source_id: `meetup-${hashStr(fullUrl)}`,
        source_url: fullUrl,
        title: stripHtml(node.title),
        description: stripHtml(node.description ?? '').slice(0, 500),
        organizer: node.group?.name ?? 'Meetup Group',
        location_name: node.venue?.name ?? cityName,
        lat: node.venue?.lat ?? fallbackLat,
        lng: node.venue?.lng ?? fallbackLng,
        starts_at: new Date(node.dateTime).toISOString(),
        ends_at: node.endTime ? new Date(node.endTime).toISOString() : null,
        cost: 'See event page',
        image_url: node.imageUrl ?? null,
      })
    }

    return events
  } catch {
    return []
  }
}
