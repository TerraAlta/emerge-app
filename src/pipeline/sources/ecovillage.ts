/**
 * Global Ecovillage Network (GEN) source fetcher — HTML scraper
 *
 * GEN has no API. Events are at gen-europe.org/events/ (GEN Europe)
 * and ecovillage.org/events/ (global).
 *
 * The pages are Drupal-rendered HTML. Events appear as structured
 * .views-row elements or in JSON-LD script tags.
 *
 * Strategy: scrape multiple GEN sites, extract events, filter by distance.
 */
import type { RawEvent, SourceFetcher } from './types'

const EVENT_PAGES = [
  'https://gen-europe.org/events/',
  'https://ecovillage.org/events/',
  'https://gen-europe.org/activities/european-events/',
]

export const ecovillage: SourceFetcher = {
  name: 'ecovillage',

  async fetch({ lat, lng, radiusKm }) {
    const allEvents: RawEvent[] = []

    for (const url of EVENT_PAGES) {
      try {
        const events = await scrapeEventPage(url, lat, lng, radiusKm)
        allEvents.push(...events)
      } catch (err) {
        console.warn(`[ecovillage] Failed to scrape ${url}:`, (err as Error).message)
      }
    }

    return allEvents
  },
}

async function scrapeEventPage(
  url: string,
  lat: number,
  lng: number,
  _radiusKm: number
): Promise<RawEvent[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html',
    },
  })

  if (!res.ok) {
    console.warn(`[ecovillage] ${url} returned ${res.status}`)
    return []
  }

  const html = await res.text()
  const events: RawEvent[] = []

  // Strategy 1: Extract JSON-LD Event markup
  const jsonLdEvents = extractJsonLd(html)
  events.push(...jsonLdEvents)

  // Strategy 2: Extract from HTML structure (Drupal views)
  if (events.length === 0) {
    const htmlEvents = extractFromHtml(html, url)
    events.push(...htmlEvents)
  }

  return events
}

function extractJsonLd(html: string): RawEvent[] {
  const events: RawEvent[] = []
  const scriptBlocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? []

  for (const block of scriptBlocks) {
    try {
      const json = block.replace(/<\/?script[^>]*>/g, '').trim()
      const data = JSON.parse(json)

      // Handle both single events and arrays
      const items = Array.isArray(data) ? data : data['@graph'] ?? [data]

      for (const item of items) {
        if (item['@type'] !== 'Event') continue
        if (!item.name || !item.startDate) continue

        // Skip past events
        if (new Date(item.startDate) < new Date()) continue

        const loc = item.location ?? {}
        const geo = loc.geo ?? {}

        events.push({
          source: 'ecovillage',
          source_id: `gen-${hashString(item.name + item.startDate)}`,
          source_url: item.url ?? null,
          title: item.name,
          description: stripHtml(item.description ?? '').slice(0, 500),
          organizer: item.organizer?.name ?? 'Global Ecovillage Network',
          location_name: loc.name ?? loc.address?.addressLocality ?? 'Ecovillage',
          lat: parseFloat(geo.latitude ?? '0'),
          lng: parseFloat(geo.longitude ?? '0'),
          starts_at: new Date(item.startDate).toISOString(),
          ends_at: item.endDate ? new Date(item.endDate).toISOString() : null,
          cost: item.offers?.price === '0' || item.isAccessibleForFree
            ? 'Free'
            : (item.offers?.price ? `${item.offers.priceCurrency ?? '€'}${item.offers.price}` : 'See event page'),
          image_url: typeof item.image === 'string' ? item.image : item.image?.url ?? null,
        })
      }
    } catch {
      // Malformed JSON-LD, skip
    }
  }

  return events
}

function extractFromHtml(html: string, sourceUrl: string): RawEvent[] {
  const events: RawEvent[] = []

  // Match Drupal views rows — common patterns across GEN sites:
  // <div class="views-row">
  //   <h3 class="field-title"><a href="...">Event Name</a></h3>
  //   <span class="date-display-single">April 15, 2026</span>
  //   <div class="field-body">Description...</div>
  // </div>

  // Simpler: match <h2> or <h3> tags that are likely event titles,
  // followed by date-like content
  const titlePattern = /<(?:h[23]|div)[^>]*class="[^"]*(?:title|heading)[^"]*"[^>]*>[\s]*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  const datePattern = /(?:class="[^"]*date[^"]*"[^>]*>|datetime=")([\s\S]*?)(?:<\/|")/gi

  let titleMatch
  const titles: Array<{ url: string; title: string }> = []

  while ((titleMatch = titlePattern.exec(html)) !== null) {
    titles.push({
      url: titleMatch[1],
      title: stripHtml(titleMatch[2]).trim(),
    })
  }

  const dates: string[] = []
  let dateMatch
  while ((dateMatch = datePattern.exec(html)) !== null) {
    const cleaned = stripHtml(dateMatch[1]).trim()
    if (cleaned.length > 3 && cleaned.length < 50) {
      dates.push(cleaned)
    }
  }

  // Pair titles with dates (best effort)
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i]
    if (!t.title || t.title.length < 5) continue

    let startsAt: string
    try {
      const dateStr = dates[i] ?? ''
      const parsed = new Date(dateStr)
      startsAt = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
    } catch {
      startsAt = new Date().toISOString()
    }

    const fullUrl = t.url.startsWith('http') ? t.url : new URL(t.url, sourceUrl).toString()

    events.push({
      source: 'ecovillage',
      source_id: `gen-html-${hashString(t.title)}`,
      source_url: fullUrl,
      title: t.title,
      description: `Ecovillage network event. See full details at the event page.`,
      organizer: 'Global Ecovillage Network',
      location_name: 'See event page',
      lat: 0,
      lng: 0,
      starts_at: startsAt,
      cost: 'See event page',
    })
  }

  return events
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}
