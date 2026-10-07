/**
 * Meetup city-based event search, via Meetup's GraphQL `eventSearch`.
 *
 * Why not the HTML: meetup.com/find ignores the keywords/location in the URL
 * on the server — it renders the same ~13 "popular near you" events for every
 * search, and the real results load client-side. The old scraper read those,
 * so from 2026 every Sunday it got the same 12 events for all 238 searches,
 * and the pre-filter threw all of them away (13 fetched → 0 inserted).
 *
 * eventSearch takes a text query + lat/lon/radius and returns real, located
 * events. Verified 2026-10-07 from a GitHub Actions runner (unlike Eventbrite,
 * Meetup doesn't block datacenter IPs): 12/12 searches returned results, e.g.
 * a FastForest planting at Minifloresta do Areeiro for Lisbon/permaculture.
 *
 * Search is loose (results are relevance-ranked, not keyword-exact), so this
 * stays `bulk: true` — the keyword pre-filter drops off-topic hits before any
 * AI cost.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { CITIES } from './cities'
import { getKeywordsForCity, getCityBatch } from './keyword-selector'

const ENDPOINT = 'https://www.meetup.com/gql2'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36'
const FETCH_TIMEOUT = 15_000
const RATE_LIMIT_MS = 1_200
/** Cities per weekly run (rotates through all of CITIES). ~12 keywords each, ~2s per search. */
const CITIES_PER_RUN = 40
const RADIUS_KM = 40
const RESULTS_PER_SEARCH = 20

const QUERY = `query ($filter: EventSearchFilter!, $first: Int) {
  eventSearch(filter: $filter, first: $first) {
    edges { node {
      id title dateTime endTime eventUrl description
      venue { name address city lat lon }
      group { name }
      featuredEventPhoto { highResUrl }
    } }
  }
}`

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const meetupCities: SourceFetcher = {
  name: 'meetup-cities',
  bulk: true,

  async fetch() {
    const seen = new Set<string>()
    const allEvents: RawEvent[] = []
    const batch = getCityBatch(CITIES, CITIES_PER_RUN)
    let searches = 0, failed = 0

    for (const city of batch) {
      let cityNew = 0
      for (const keyword of getKeywordsForCity(city)) {
        searches++
        try {
          for (const ev of await searchMeetup(keyword, city.name, city.lat, city.lng)) {
            if (!ev.source_url || seen.has(ev.source_url)) continue
            seen.add(ev.source_url)
            allEvents.push(ev)
            cityNew++
          }
        } catch (err) {
          failed++
          console.warn(`[meetup-cities] ${city.name}: "${keyword}" failed:`, (err as Error).message)
        }
        await sleep(RATE_LIMIT_MS)
      }
      if (cityNew > 0) console.log(`[meetup-cities] ${city.name}: ${cityNew} events`)
    }

    console.log(`[meetup-cities] Total: ${allEvents.length} unique events from ${batch.length} cities (${searches} searches, ${failed} failed)`)
    // Say it loudly if Meetup changes its API again — the old failure was silent.
    if (searches > 0 && failed / searches > 0.5) {
      console.warn(`[meetup-cities] WARNING: ${failed}/${searches} searches failed — Meetup's GraphQL may have changed.`)
    }
    return allEvents
  },
}

/** Exported for scripts/tests; the pipeline uses meetupCities.fetch(). */
export async function searchMeetup(keyword: string, cityName: string, lat: number, lng: number): Promise<RawEvent[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        first: RESULTS_PER_SEARCH,
        filter: { query: keyword, lat, lon: lng, radius: RADIUS_KM, eventType: 'PHYSICAL' },
      },
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data?.errors?.length) throw new Error(data.errors[0]?.message ?? 'GraphQL error')

  const now = new Date()
  const events: RawEvent[] = []
  for (const edge of data?.data?.eventSearch?.edges ?? []) {
    const node = edge?.node
    if (!node?.title || !node?.dateTime || !node?.eventUrl) continue
    if (new Date(node.dateTime) < now) continue
    const venue = node.venue ?? {}
    // A real venue is required — no coordinates means we can't place it on the map.
    if (typeof venue.lat !== 'number' || typeof venue.lon !== 'number' || (venue.lat === 0 && venue.lon === 0)) continue

    events.push({
      source: 'meetup-cities',
      source_id: `meetup-${node.id ?? hashStr(node.eventUrl)}`,
      source_url: node.eventUrl,
      title: stripHtml(node.title),
      description: stripHtml(node.description ?? '').slice(0, 500),
      organizer: node.group?.name ?? 'Meetup Group',
      location_name: [venue.name, venue.city].filter(Boolean).join(', ') || cityName,
      lat: venue.lat,
      lng: venue.lon,
      starts_at: new Date(node.dateTime).toISOString(),
      ends_at: node.endTime ? new Date(node.endTime).toISOString() : null,
      cost: 'See event page',
      image_url: node.featuredEventPhoto?.highResUrl ?? null,
    })
  }
  return events
}
