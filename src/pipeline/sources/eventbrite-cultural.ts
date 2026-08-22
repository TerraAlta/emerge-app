/**
 * Eventbrite cultural/diaspora event scraper.
 *
 * Two approaches:
 * 1. Scrapes the "Cultural & Ethnic Identity" category per city
 * 2. Searches diaspora-specific keywords (Nowruz, iftar, Diwali etc.)
 * 3. During seasonal windows, searches boosted keywords more aggressively
 *
 * Uses the same extraction strategies as eventbrite-cities.ts but with
 * cultural feast keywords and the identity category.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { CITIES } from './cities'
import { CULTURAL_KEYWORDS, getActiveSeasonalKeywords } from './cultural-keywords'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const FETCH_TIMEOUT = 10_000
const RATE_LIMIT_MS = 400

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Map country names to Eventbrite URL slugs */
function countrySlug(country: string): string {
  const map: Record<string, string> = {
    'Portugal': 'portugal', 'Germany': 'germany', 'Netherlands': 'netherlands',
    'United Kingdom': 'united-kingdom', 'France': 'france', 'Belgium': 'belgium',
    'Spain': 'spain', 'Italy': 'italy', 'Switzerland': 'switzerland',
    'Malta': 'malta', 'Ireland': 'ireland', 'Austria': 'austria',
    'Luxembourg': 'luxembourg', 'Denmark': 'denmark', 'Finland': 'finland',
    'Iceland': 'iceland', 'Serbia': 'serbia', 'Slovenia': 'slovenia',
    'Hungary': 'hungary', 'Canada': 'canada', 'United States': 'united-states',
  }
  return map[country] ?? country.toLowerCase().replace(/\s+/g, '-')
}

export const eventbriteCultural: SourceFetcher = {
  name: 'eventbrite-cultural',
  bulk: true,

  async fetch() {
    const seen = new Set<string>()
    const allEvents: RawEvent[] = []

    // Combine base cultural keywords with any active seasonal boost keywords
    const seasonalBoost = getActiveSeasonalKeywords()
    const allKeywords = [...new Set([...CULTURAL_KEYWORDS, ...seasonalBoost])]

    console.log(`[eventbrite-cultural] Searching ${allKeywords.length} keywords across ${CITIES.length} cities`)
    if (seasonalBoost.length > 0) {
      console.log(`[eventbrite-cultural] Seasonal boost active: +${seasonalBoost.length} keywords`)
    }

    // Layer 1: Cultural & Ethnic Identity category per city
    for (const city of CITIES) {
      try {
        const events = await scrapeCategoryPage(city.name, city.country, city.lat, city.lng)
        let added = 0
        for (const ev of events) {
          const key = ev.source_url ?? ev.source_id
          if (seen.has(key)) continue
          seen.add(key)
          allEvents.push(ev)
          added++
        }
        if (added > 0) {
          console.log(`[eventbrite-cultural] ${city.name} category page → ${added} events`)
        }
      } catch (err) {
        // Many cities won't have this category page
      }
      await sleep(RATE_LIMIT_MS)
    }

    // Layer 2: Keyword searches
    for (const city of CITIES) {
      for (const keyword of allKeywords) {
        try {
          const events = await scrapeKeywordSearch(city.name, city.country, keyword, city.lat, city.lng)
          let added = 0
          for (const ev of events) {
            const key = ev.source_url ?? ev.source_id
            if (seen.has(key)) continue
            seen.add(key)
            allEvents.push(ev)
            added++
          }
          if (added > 0) {
            console.log(`[eventbrite-cultural] ${city.name}: "${keyword}" → ${added} events`)
          }
        } catch {
          // skip
        }
        await sleep(RATE_LIMIT_MS)
      }
    }

    console.log(`[eventbrite-cultural] Total: ${allEvents.length} unique events`)
    return allEvents
  },
}

/**
 * Scrape Eventbrite's "Cultural & Ethnic Identity" category page for a city.
 */
async function scrapeCategoryPage(
  cityName: string,
  country: string,
  fallbackLat: number,
  fallbackLng: number,
): Promise<RawEvent[]> {
  const slug = countrySlug(country)
  const cityS = cityName.toLowerCase().replace(/\s+/g, '-')
  const url = `https://www.eventbrite.com/d/${slug}--${cityS}/cultural-ethnic-identity--events/`

  return await fetchAndExtract(url, fallbackLat, fallbackLng)
}

/**
 * Search Eventbrite for a specific cultural keyword in a city.
 */
async function scrapeKeywordSearch(
  cityName: string,
  country: string,
  keyword: string,
  fallbackLat: number,
  fallbackLng: number,
): Promise<RawEvent[]> {
  const slug = countrySlug(country)
  const cityS = cityName.toLowerCase().replace(/\s+/g, '-')
  const keywordS = keyword.replace(/\s+/g, '-')
  const url = `https://www.eventbrite.com/d/${slug}--${cityS}/${keywordS}/`

  return await fetchAndExtract(url, fallbackLat, fallbackLng)
}

/**
 * Fetch an Eventbrite page and extract events using JSON-LD + fallback strategies.
 */
async function fetchAndExtract(
  url: string,
  fallbackLat: number,
  fallbackLng: number,
): Promise<RawEvent[]> {
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

  // Strategy 1: JSON-LD
  const jsonLdEvents = extractJsonLd(html, 'eventbrite-cultural')
  if (jsonLdEvents.length > 0) {
    return jsonLdEvents.map(ev => ({
      ...ev,
      source: 'eventbrite-cultural',
      source_id: `eb-cultural-${hashStr(ev.source_url ?? ev.title + ev.starts_at)}`,
      lat: ev.lat || fallbackLat,
      lng: ev.lng || fallbackLng,
    }))
  }

  // Strategy 2: API endpoint fallback
  return await tryApiSearch(url, fallbackLat, fallbackLng)
}

async function tryApiSearch(
  refererUrl: string,
  fallbackLat: number,
  fallbackLng: number,
): Promise<RawEvent[]> {
  // Extract keyword from URL for API search
  const parts = refererUrl.split('/')
  const keyword = parts[parts.length - 2]?.replace(/-/g, ' ') ?? ''
  if (!keyword) return []

  try {
    const res = await fetch('https://www.eventbrite.com/api/v3/destination/search/', {
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
          places: [{ latitude: fallbackLat, longitude: fallbackLng, within: '50km' }],
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
          source: 'eventbrite-cultural',
          source_id: `eb-cultural-${hashStr(eventUrl)}`,
          source_url: eventUrl,
          title: stripHtml(item.name ?? ''),
          description: stripHtml(item.summary ?? item.description?.text ?? '').slice(0, 500),
          organizer: item.organizer?.name ?? 'Eventbrite Organizer',
          location_name: item.venue?.name ?? item.venue?.address?.city ?? 'See event page',
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
