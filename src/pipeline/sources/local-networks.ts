/**
 * City-specific local network scrapers.
 *
 * Each city has a curated list of regenerative organizations. We scrape their
 * events pages for JSON-LD, iCal links, or structured HTML to extract events.
 *
 * Rate-limited to 1.5s between requests to be respectful.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const FETCH_TIMEOUT = 15_000
const RATE_LIMIT_MS = 1_500

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Organisation Definitions ───────────────────────────────────────────────

export interface LocalOrg {
  name: string
  city: string
  country: string
  lat: number
  lng: number
  urls: string[]  // event page URLs to scrape
}

const LOCAL_ORGS: LocalOrg[] = [
  // ── Bristol, UK ───────────────────────────────────────────────────────────
  {
    name: 'Shift Bristol',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://shiftbristol.org.uk/events/', 'https://shiftbristol.org.uk/whats-on/'],
  },
  {
    name: 'Bristol Climate & Nature Partnership',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://bristolclimatenature.org/events/'],
  },
  {
    name: 'Incredible Edible Bristol',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://www.incredibleediblebristol.org.uk/events/'],
  },
  {
    name: 'Transition Bristol',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://transitionbristol.net/events/'],
  },
  {
    name: 'Nature Collective Bristol',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://thenaturecollective.uk/events/'],
  },
  {
    name: 'Good Grief Network Bristol',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://www.goodgriefnetwork.org/events/'],
  },

  // ── Toulouse, France ──────────────────────────────────────────────────────
  {
    name: 'Colibris Toulouse',
    city: 'Toulouse', country: 'France', lat: 43.6047, lng: 1.4442,
    urls: ['https://colibris-lemouvement.org/agenda?field_departement_value=31'],
  },
  {
    name: 'Alternatiba Toulouse',
    city: 'Toulouse', country: 'France', lat: 43.6047, lng: 1.4442,
    urls: ['https://alternatiba.eu/toulouse/', 'https://alternatiba.eu/agenda/'],
  },
  {
    name: 'Repair Café Toulouse',
    city: 'Toulouse', country: 'France', lat: 43.6047, lng: 1.4442,
    urls: ['https://repaircafe.org/en/locations/?search=toulouse'],
  },
  {
    name: 'Incroyables Comestibles Toulouse',
    city: 'Toulouse', country: 'France', lat: 43.6047, lng: 1.4442,
    urls: ['https://lesincroyablescomestibles.fr/toulouse/'],
  },

  // ── Montpellier, France ───────────────────────────────────────────────────
  {
    name: 'Colibris Montpellier',
    city: 'Montpellier', country: 'France', lat: 43.6108, lng: 3.8767,
    urls: ['https://colibris-lemouvement.org/agenda?field_departement_value=34'],
  },
  {
    name: 'Transition Montpellier',
    city: 'Montpellier', country: 'France', lat: 43.6108, lng: 3.8767,
    urls: ['https://transitionmontpellier.fr/evenements/'],
  },
  {
    name: 'Repair Café Montpellier',
    city: 'Montpellier', country: 'France', lat: 43.6108, lng: 3.8767,
    urls: ['https://repaircafe.org/en/locations/?search=montpellier'],
  },
  {
    name: 'Permaculture France — Montpellier',
    city: 'Montpellier', country: 'France', lat: 43.6108, lng: 3.8767,
    urls: ['https://www.permaculture-france.fr/evenements/'],
  },

  // ── Bilbao, Spain ─────────────────────────────────────────────────────────
  {
    name: 'Red de Transición Bilbao',
    city: 'Bilbao', country: 'Spain', lat: 43.2630, lng: -2.9350,
    urls: ['https://www.reddetransicion.org/agenda/', 'https://www.reddetransicion.org/eventos/'],
  },
  {
    name: 'Mercado Agroecológico Bilbao',
    city: 'Bilbao', country: 'Spain', lat: 43.2630, lng: -2.9350,
    urls: ['https://www.mercadoagroecologico.org/eventos/'],
  },
  {
    name: 'Mondragon University Events',
    city: 'Bilbao', country: 'Spain', lat: 43.2630, lng: -2.9350,
    urls: ['https://www.mondragon.edu/en/events'],
  },

  // ── Freiburg, Germany ─────────────────────────────────────────────────────
  {
    name: 'Ernährungsrat Freiburg',
    city: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421,
    urls: ['https://ernaehrungsrat-freiburg.de/veranstaltungen/', 'https://ernaehrungsrat-freiburg.de/termine/'],
  },
  {
    name: 'Transition Freiburg',
    city: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421,
    urls: ['https://transition-freiburg.de/veranstaltungen/', 'https://transition-freiburg.de/events/'],
  },
  {
    name: 'Stadtteilverein Vauban',
    city: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421,
    urls: ['https://stadtteilverein-vauban.de/veranstaltungen/', 'https://stadtteilverein-vauban.de/termine/'],
  },
  {
    name: 'Regenerate Forum',
    city: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421,
    urls: ['https://regenerateforum.org/events/'],
  },
  {
    name: 'Permakultur Freiburg',
    city: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421,
    urls: ['https://www.permakultur.de/veranstaltungen/', 'https://www.permakultur.de/termine/'],
  },

  // ── Wageningen, Netherlands ───────────────────────────────────────────────
  {
    name: 'WUR Public Events',
    city: 'Wageningen', country: 'Netherlands', lat: 51.9692, lng: 5.6656,
    urls: ['https://www.wur.nl/en/events.htm'],
  },
  {
    name: 'WUR Rural Sociology',
    city: 'Wageningen', country: 'Netherlands', lat: 51.9692, lng: 5.6656,
    urls: ['https://ruralsociologywageningen.nl/category/events/'],
  },
  {
    name: 'Herenboer Wageningen',
    city: 'Wageningen', country: 'Netherlands', lat: 51.9692, lng: 5.6656,
    urls: ['https://www.herenboeren.nl/agenda/'],
  },

  // ── Brighton, UK ──────────────────────────────────────────────────────────
  {
    name: 'Brighton Permaculture Trust',
    city: 'Brighton', country: 'United Kingdom', lat: 50.8225, lng: -0.1372,
    urls: ['https://brightonpermaculture.org.uk/courses-and-events/'],
  },
  {
    name: 'Stanmer Organics',
    city: 'Brighton', country: 'United Kingdom', lat: 50.8225, lng: -0.1372,
    urls: ['https://www.stanmerorganics.com/events/'],
  },
  {
    name: 'Brighton & Hove Food Partnership',
    city: 'Brighton', country: 'United Kingdom', lat: 50.8225, lng: -0.1372,
    urls: ['https://bhfood.org.uk/events/'],
  },
  {
    name: 'Fork and Dig It Brighton',
    city: 'Brighton', country: 'United Kingdom', lat: 50.8225, lng: -0.1372,
    urls: ['https://www.forkanddigit.org.uk/events/'],
  },

  // ── Ghent, Belgium ────────────────────────────────────────────────────────
  {
    name: 'Ghent en Garde',
    city: 'Ghent', country: 'Belgium', lat: 51.0543, lng: 3.7174,
    urls: ['https://gentengarde.be/activiteiten/', 'https://gentengarde.be/events/'],
  },
  {
    name: 'Transitie Gent',
    city: 'Ghent', country: 'Belgium', lat: 51.0543, lng: 3.7174,
    urls: ['https://transitiegent.be/agenda/', 'https://transitiegent.be/events/'],
  },
  {
    name: 'Repair Café Ghent',
    city: 'Ghent', country: 'Belgium', lat: 51.0543, lng: 3.7174,
    urls: ['https://repaircafe.org/en/locations/?search=ghent'],
  },
  {
    name: 'CSA Netwerk Belgium — Ghent',
    city: 'Ghent', country: 'Belgium', lat: 51.0543, lng: 3.7174,
    urls: ['https://www.csanetwerk.be/agenda/'],
  },

  // ── Bologna, Italy ────────────────────────────────────────────────────────
  {
    name: 'WWOOF Italia Events',
    city: 'Bologna', country: 'Italy', lat: 44.4949, lng: 11.3426,
    urls: ['https://www.wwoof.it/eventi/', 'https://www.wwoof.it/en/events/'],
  },
  {
    name: 'Transizione Italia — Bologna',
    city: 'Bologna', country: 'Italy', lat: 44.4949, lng: 11.3426,
    urls: ['https://transizioneitalia.it/eventi/'],
  },
  {
    name: 'Legacoop Bologna',
    city: 'Bologna', country: 'Italy', lat: 44.4949, lng: 11.3426,
    urls: ['https://www.legacoop.bologna.it/eventi/', 'https://www.legacoop.bologna.it/events/'],
  },
]

// ─── Scraper Logic ──────────────────────────────────────────────────────────

/**
 * Scrape a single URL for events using multiple extraction strategies.
 */
async function scrapeOrgPage(url: string, org: LocalOrg): Promise<RawEvent[]> {
  let html: string
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!res.ok) return []
    html = await res.text()
  } catch {
    return []
  }

  const events: RawEvent[] = []

  // Strategy 1: JSON-LD extraction (handles ItemList and standalone Event)
  const jsonLdEvents = extractJsonLd(html, 'local-network')
  for (const ev of jsonLdEvents) {
    events.push({
      ...ev,
      source: 'local-network',
      source_id: `local-${hashStr(ev.source_url ?? ev.title + ev.starts_at)}`,
      organizer: org.name,
      lat: ev.lat || org.lat,
      lng: ev.lng || org.lng,
    })
  }

  // Strategy 2: Microdata / hEvent extraction
  const hEvents = extractHEvents(html, org)
  events.push(...hEvents)

  // Strategy 3: WordPress/Tribe Events pattern extraction
  const wpEvents = extractWordPressEvents(html, url, org)
  events.push(...wpEvents)

  // Strategy 4: Generic date + title pattern extraction
  if (events.length === 0) {
    const genericEvents = extractGenericEvents(html, url, org)
    events.push(...genericEvents)
  }

  return events
}

/**
 * Extract hEvent/microdata events from HTML.
 */
function extractHEvents(html: string, org: LocalOrg): RawEvent[] {
  const events: RawEvent[] = []
  // Match h-event or vevent microformat blocks
  const hEventBlocks = html.match(/<[^>]*class="[^"]*(?:h-event|vevent|type-tribe_events|event-item|tribe-events-single)[^"]*"[^>]*>[\s\S]*?<\/(?:article|div|li)>/gi) ?? []

  for (const block of hEventBlocks) {
    const title = extractText(block, /class="[^"]*(?:p-name|summary|tribe-events-list-event-title|event-title|entry-title)[^"]*"[^>]*>([\s\S]*?)</)
    const dateStr = extractAttr(block, /(?:datetime|content)="(\d{4}-\d{2}-\d{2}[T\d:+-]*)"/i)
      ?? extractText(block, /class="[^"]*(?:dt-start|dtstart|tribe-event-schedule-details|event-date)[^"]*"[^>]*>([\s\S]*?)</)
    const desc = extractText(block, /class="[^"]*(?:p-description|description|tribe-events-list-event-description|event-description|entry-content)[^"]*"[^>]*>([\s\S]*?)</)
    const link = extractAttr(block, /href="(https?:\/\/[^"]+)"/)

    if (!title || !dateStr) continue

    const parsedDate = parseFlexibleDate(dateStr)
    if (!parsedDate || parsedDate < new Date()) continue

    events.push({
      source: 'local-network',
      source_id: `local-${hashStr(link ?? title + dateStr)}`,
      source_url: link,
      title: stripHtml(title).slice(0, 200),
      description: stripHtml(desc ?? '').slice(0, 500),
      organizer: org.name,
      location_name: `${org.name}, ${org.city}`,
      lat: org.lat,
      lng: org.lng,
      starts_at: parsedDate.toISOString(),
      cost: 'See event page',
    })
  }

  return events
}

/**
 * Extract events from WordPress / The Events Calendar (Tribe) markup.
 */
function extractWordPressEvents(html: string, baseUrl: string, org: LocalOrg): RawEvent[] {
  const events: RawEvent[] = []

  // Tribe Events JSON-LD often embedded separately
  const tribeMatch = html.match(/var defined_json_ld\s*=\s*(\[[\s\S]*?\]);/i)
    ?? html.match(/tribe-events-event-json-ld">([\s\S]*?)<\/script>/)
  if (tribeMatch?.[1]) {
    try {
      const data = JSON.parse(tribeMatch[1])
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item['@type'] !== 'Event') continue
        if (!item.name || !item.startDate) continue
        if (new Date(item.startDate) < new Date()) continue

        const loc = item.location ?? {}
        const geo = loc.geo ?? {}

        events.push({
          source: 'local-network',
          source_id: `local-${hashStr(item.url ?? item.name + item.startDate)}`,
          source_url: item.url ?? null,
          title: stripHtml(item.name),
          description: stripHtml(item.description ?? '').slice(0, 500),
          organizer: org.name,
          location_name: loc.name ?? `${org.name}, ${org.city}`,
          lat: parseFloat(geo.latitude ?? '0') || org.lat,
          lng: parseFloat(geo.longitude ?? '0') || org.lng,
          starts_at: new Date(item.startDate).toISOString(),
          ends_at: item.endDate ? new Date(item.endDate).toISOString() : null,
          cost: item.isAccessibleForFree ? 'Free' : 'See event page',
          image_url: typeof item.image === 'string' ? item.image : item.image?.url ?? null,
        })
      }
    } catch { /* skip */ }
  }

  // WP event list items: common patterns from popular WP calendar plugins
  const wpListItems = html.match(/<article[^>]*class="[^"]*(?:post-type-tribe_events|event_listing|ai1ec-event)[^"]*"[\s\S]*?<\/article>/gi) ?? []
  for (const block of wpListItems) {
    const title = extractText(block, /<h\d[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/)
      ?? extractText(block, /class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)</)
    const link = extractAttr(block, /<a\s+href="(https?:\/\/[^"]+)"/)
    const dateStr = extractAttr(block, /datetime="(\d{4}-\d{2}-\d{2}[T\d:+-]*)"/i)
      ?? extractText(block, /class="[^"]*(?:event-date|tribe-event-date-start)[^"]*"[^>]*>([\s\S]*?)</)

    if (!title || !dateStr) continue
    const parsedDate = parseFlexibleDate(dateStr)
    if (!parsedDate || parsedDate < new Date()) continue

    // Skip if already found via JSON-LD
    if (events.some(e => e.title === stripHtml(title))) continue

    events.push({
      source: 'local-network',
      source_id: `local-${hashStr(link ?? title + dateStr)}`,
      source_url: link,
      title: stripHtml(title).slice(0, 200),
      description: '',
      organizer: org.name,
      location_name: `${org.name}, ${org.city}`,
      lat: org.lat,
      lng: org.lng,
      starts_at: parsedDate.toISOString(),
      cost: 'See event page',
    })
  }

  return events
}

/**
 * Last-resort: extract events from generic HTML patterns.
 * Looks for date patterns near title-like elements.
 */
function extractGenericEvents(html: string, baseUrl: string, org: LocalOrg): RawEvent[] {
  const events: RawEvent[] = []
  const baseOrigin = new URL(baseUrl).origin

  // Common event card patterns
  const cardPatterns = [
    // <a> with date-like content nearby
    /<(?:div|li|article)[^>]*class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li|article)>/gi,
    // Eventbrite-style widget embeds
    /<div[^>]*data-widget-id[^>]*>([\s\S]*?)<\/div>/gi,
  ]

  for (const pattern of cardPatterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      const block = match[1] ?? match[0]
      const title = extractText(block, /<(?:h[1-6]|a|strong|b)[^>]*>([\s\S]*?)<\//)
      const link = extractAttr(block, /href="(\/[^"]+|https?:\/\/[^"]+)"/)
      const dateStr = extractAttr(block, /datetime="([^"]+)"/i)
        ?? extractText(block, /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i)
        ?? extractText(block, /(\d{4}-\d{2}-\d{2})/)

      if (!title || !dateStr) continue
      const parsedDate = parseFlexibleDate(dateStr)
      if (!parsedDate || parsedDate < new Date()) continue

      const fullLink = link?.startsWith('http') ? link : link ? `${baseOrigin}${link}` : null

      events.push({
        source: 'local-network',
        source_id: `local-${hashStr(fullLink ?? title + dateStr)}`,
        source_url: fullLink,
        title: stripHtml(title).slice(0, 200),
        description: '',
        organizer: org.name,
        location_name: `${org.name}, ${org.city}`,
        lat: org.lat,
        lng: org.lng,
        starts_at: parsedDate.toISOString(),
        cost: 'See event page',
      })
    }
  }

  return events
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractText(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern)
  return m?.[1] ? stripHtml(m[1]).trim() : null
}

function extractAttr(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern)
  return m?.[1]?.trim() ?? null
}

function parseFlexibleDate(str: string): Date | null {
  if (!str) return null

  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str)
    return isNaN(d.getTime()) ? null : d
  }

  // "21 March 2026" or "March 21, 2026"
  const d = new Date(str)
  if (!isNaN(d.getTime()) && d.getFullYear() > 2020) return d

  // European: "21/03/2026" or "21.03.2026"
  const euMatch = str.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/)
  if (euMatch) {
    const [, day, month, year] = euMatch
    const parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    return isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}

// ─── Exported Fetcher ───────────────────────────────────────────────────────

export const localNetworks: SourceFetcher = {
  name: 'local-networks',

  async fetch() {
    const seen = new Set<string>()
    const allEvents: RawEvent[] = []

    for (const org of LOCAL_ORGS) {
      for (const url of org.urls) {
        try {
          const events = await scrapeOrgPage(url, org)
          let added = 0
          for (const ev of events) {
            const key = ev.source_url ?? ev.source_id
            if (seen.has(key)) continue
            seen.add(key)
            allEvents.push(ev)
            added++
          }
          if (events.length > 0) {
            console.log(`[local-networks] ${org.name}: ${added} events from ${url}`)
          }
        } catch (err) {
          console.warn(`[local-networks] ${org.name}: failed ${url}:`, (err as Error).message)
        }
        await sleep(RATE_LIMIT_MS)
      }
    }

    console.log(`[local-networks] Total: ${allEvents.length} unique events from ${LOCAL_ORGS.length} organisations across ${new Set(LOCAL_ORGS.map(o => o.city)).size} cities`)
    return allEvents
  },
}

export { LOCAL_ORGS }
