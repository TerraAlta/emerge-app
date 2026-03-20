/**
 * Eventbrite official API scraper.
 *
 * Uses the Eventbrite v3 API with an API key to search for events
 * matching Emerge soul document keywords across all pipeline cities.
 * Requires EVENTBRITE_API_KEY in environment.
 */
import type { RawEvent, SourceFetcher } from './types'
import { CITIES } from './cities'

const RATE_LIMIT_MS = 500
const FETCH_TIMEOUT = 10_000

const KEYWORDS = [
  'repair café', 'permaculture', 'seed swap', 'food forest',
  'transition town', 'zero waste', 'community kitchen', 'composting',
  'rewilding', 'fermentation', 'theatre of the oppressed', 'forum theatre',
  'community choir', 'ecotherapy',
]

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const eventbriteApi: SourceFetcher = {
  name: 'eventbrite-api',

  async fetch() {
    const apiKey = process.env.EVENTBRITE_API_KEY
    if (!apiKey) {
      console.warn('[eventbrite-api] No EVENTBRITE_API_KEY — skipping')
      return []
    }

    const seen = new Set<string>()
    const allEvents: RawEvent[] = []

    for (const city of CITIES) {
      for (const keyword of KEYWORDS) {
        try {
          const events = await searchEventbriteApi(apiKey, keyword, city.lat, city.lng)
          for (const ev of events) {
            const key = ev.source_url ?? ev.source_id
            if (seen.has(key)) continue
            seen.add(key)
            allEvents.push(ev)
          }
          if (events.length > 0) {
            console.log(`[eventbrite-api] ${city.name}: "${keyword}" → ${events.length} events`)
          }
        } catch (err) {
          console.warn(`[eventbrite-api] ${city.name}: "${keyword}" failed:`, (err as Error).message)
        }
        await sleep(RATE_LIMIT_MS)
      }
    }

    console.log(`[eventbrite-api] Total: ${allEvents.length} unique events`)
    return allEvents
  },
}

async function searchEventbriteApi(
  apiKey: string,
  keyword: string,
  lat: number,
  lng: number,
): Promise<RawEvent[]> {
  const params = new URLSearchParams({
    q: keyword,
    'location.latitude': lat.toString(),
    'location.longitude': lng.toString(),
    'location.within': '25km',
    expand: 'venue',
    sort_by: 'date',
  })

  const res = await fetch(`https://www.eventbriteapi.com/v3/events/search/?${params}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })

  if (!res.ok) {
    if (res.status === 401) console.error('[eventbrite-api] Invalid API key')
    return []
  }

  const data = await res.json()
  const events: any[] = data.events ?? []

  return events
    .filter(ev => ev.name?.text && ev.start?.utc)
    .filter(ev => new Date(ev.start.utc) >= new Date())
    .map(ev => {
      const venue = ev.venue ?? {}
      const eventUrl = ev.url ?? `https://www.eventbrite.com/e/${ev.id}`

      return {
        source: 'eventbrite-api',
        source_id: `eb-api-${ev.id}`,
        source_url: eventUrl,
        title: ev.name.text.slice(0, 200),
        description: (ev.description?.text ?? ev.summary ?? '').slice(0, 500),
        organizer: ev.organizer?.name ?? 'Eventbrite Organizer',
        location_name: venue.name ?? venue.address?.localized_address_display ?? 'See event page',
        lat: parseFloat(venue.latitude ?? '0') || lat,
        lng: parseFloat(venue.longitude ?? '0') || lng,
        starts_at: new Date(ev.start.utc).toISOString(),
        ends_at: ev.end?.utc ? new Date(ev.end.utc).toISOString() : null,
        cost: ev.is_free ? 'Free' : 'See event page',
        image_url: ev.logo?.url ?? null,
      } as RawEvent
    })
}
