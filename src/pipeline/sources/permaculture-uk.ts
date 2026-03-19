/**
 * Permaculture Association UK — permaculture.org.uk/events
 * Tries RSS feed, then The Events Calendar REST API (common WP plugin),
 * then HTML scrape.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const BASE = 'https://www.permaculture.org.uk'

export const permacultureUk: SourceFetcher = {
  name: 'permaculture-uk',
  async fetch() {
    // Strategy 1: The Events Calendar REST API (very common WP plugin)
    const apiEvents = await tryEventsCalendarApi()
    if (apiEvents.length > 0) return apiEvents

    // Strategy 2: RSS feed
    const rssEvents = await tryRss()
    if (rssEvents.length > 0) return rssEvents

    // Strategy 3: HTML scrape of /events page
    return scrapeEventsPage()
  },
}

async function tryEventsCalendarApi(): Promise<RawEvent[]> {
  // The Events Calendar plugin exposes /wp-json/tribe/events/v1/events
  const urls = [
    `${BASE}/wp-json/tribe/events/v1/events?per_page=20&start_date=now`,
    `${BASE}/wp-json/tribe/events/v1/events`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Emerge-App/1.0', Accept: 'application/json' },
      })
      if (!res.ok) continue
      const data = await res.json()
      const events = data.events ?? []
      if (events.length === 0) continue

      return events.map((e: any) => ({
        source: 'permaculture-uk',
        source_id: `pa-uk-${e.id}`,
        source_url: e.url ?? `${BASE}/events`,
        title: stripHtml(e.title ?? ''),
        description: stripHtml(e.description ?? '').slice(0, 500),
        organizer: e.organizer?.[0]?.organizer ?? 'Permaculture Association',
        location_name: e.venue?.venue ?? e.venue?.city ?? 'UK',
        lat: parseFloat(e.venue?.geo_lat ?? '0'),
        lng: parseFloat(e.venue?.geo_lng ?? '0'),
        starts_at: e.utc_start_date ? new Date(e.utc_start_date).toISOString() : new Date(e.start_date).toISOString(),
        ends_at: e.utc_end_date ? new Date(e.utc_end_date).toISOString() : null,
        cost: e.cost ?? 'See event page',
        image_url: e.image?.url ?? null,
      }))
    } catch { continue }
  }
  return []
}

async function tryRss(): Promise<RawEvent[]> {
  const rssUrls = [
    `${BASE}/events/list/?ical=1`,
    `${BASE}/feed/?post_type=tribe_events`,
    `${BASE}/events/feed/`,
  ]

  for (const url of rssUrls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Emerge-App/1.0', Accept: 'application/rss+xml, text/xml, text/calendar' },
      })
      if (!res.ok) continue
      const text = await res.text()

      // Try iCal format
      if (text.includes('BEGIN:VEVENT')) return parseIcal(text)
      // Try RSS
      if (text.includes('<item>')) return parseRss(text)
    } catch { continue }
  }
  return []
}

function parseIcal(ical: string): RawEvent[] {
  const events: RawEvent[] = []
  const blocks = ical.split('BEGIN:VEVENT')

  for (const block of blocks.slice(1)) {
    const get = (key: string) => {
      const m = block.match(new RegExp(`${key}[^:]*:(.*)`, 'i'))
      return m ? m[1].trim().replace(/\\n/g, ' ').replace(/\\\\/g, '') : ''
    }

    const title = get('SUMMARY')
    if (!title) continue

    const dtStart = get('DTSTART')
    let startsAt: string
    try {
      // iCal dates: 20260322T100000Z or 20260322
      const cleaned = dtStart.replace(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?/, '$1-$2-$3T$4:$5:$6Z')
      startsAt = new Date(cleaned).toISOString()
    } catch {
      startsAt = new Date().toISOString()
    }

    events.push({
      source: 'permaculture-uk',
      source_id: `pa-uk-${hashStr(title + dtStart)}`,
      source_url: get('URL') || `${BASE}/events`,
      title,
      description: get('DESCRIPTION').slice(0, 500),
      organizer: 'Permaculture Association UK',
      location_name: get('LOCATION') || 'UK',
      lat: 0, lng: 0,
      starts_at: startsAt,
      cost: 'See event page',
    })
  }

  return events
}

function parseRss(xml: string): RawEvent[] {
  const events: RawEvent[] = []
  const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? []

  for (const item of items) {
    const tag = (t: string) => {
      const m = item.match(new RegExp(`<${t}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${t}>`, 'i'))
      return m ? m[1].trim() : ''
    }

    const title = stripHtml(tag('title'))
    if (!title || title.length < 5) continue

    events.push({
      source: 'permaculture-uk',
      source_id: `pa-uk-${hashStr(title)}`,
      source_url: tag('link') || `${BASE}/events`,
      title,
      description: stripHtml(tag('description')).slice(0, 500),
      organizer: 'Permaculture Association UK',
      location_name: 'UK',
      lat: 0, lng: 0,
      starts_at: tag('pubDate') ? new Date(tag('pubDate')).toISOString() : new Date().toISOString(),
      cost: 'See event page',
    })
  }

  return events
}

async function scrapeEventsPage(): Promise<RawEvent[]> {
  try {
    const res = await fetch(`${BASE}/events/`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
    })
    if (!res.ok) return []
    const html = await res.text()
    const events: RawEvent[] = []

    // The Events Calendar uses tribe-events-list, tribe-event-url etc.
    const pattern = /<(?:article|div|h[23])[^>]*class="[^"]*tribe[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    let match
    while ((match = pattern.exec(html)) !== null) {
      const title = stripHtml(match[2]).trim()
      if (!title || title.length < 8 || title.toLowerCase().includes('search') || title.toLowerCase().includes('navigation')) continue

      events.push({
        source: 'permaculture-uk',
        source_id: `pa-uk-${hashStr(title)}`,
        source_url: match[1].startsWith('http') ? match[1] : `${BASE}${match[1]}`,
        title,
        description: 'UK permaculture event. See link for full details.',
        organizer: 'Permaculture Association UK',
        location_name: 'UK',
        lat: 0, lng: 0,
        starts_at: new Date().toISOString(),
        cost: 'See event page',
      })
    }

    return events
  } catch { return [] }
}
