/**
 * Terra Alta — terralta.org — permaculture education centre in Ulgueira,
 * Colares (Sintra). Runs 10-day Permaculture Design Courses (PDCs).
 *
 * The site is Wix. /permaculture-courses links every course page
 * (/event-info/<slug>), and each of those carries a schema.org Event in
 * JSON-LD with real dates and venue — that's what we read.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const LIST_URL = 'https://www.terralta.org/permaculture-courses'
const SRC = 'terra-alta-pt'
const ORG = 'Terra Alta'
// Ulgueira, Colares — the site's own GeoCoordinates
const LAT = 38.7833
const LNG = -9.3833
const MAX_PAGES = 20

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(20000),
    })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

function jsonLdEvents(html: string): any[] {
  const out: any[] = []
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1])
      for (const item of Array.isArray(data) ? data : data['@graph'] ?? [data]) {
        if (item?.['@type'] === 'Event' && item.name && item.startDate) out.push(item)
      }
    } catch {
      /* skip malformed block */
    }
  }
  return out
}

export const terraAltaPt: SourceFetcher = {
  name: SRC,
  async fetch() {
    const list = await get(LIST_URL)
    if (!list) return []
    const pages = [...new Set(list.match(/https:\/\/www\.terralta\.org\/event-info\/[a-z0-9-]+/g) ?? [])]

    const now = Date.now()
    const events: RawEvent[] = []
    for (const url of pages.slice(0, MAX_PAGES)) {
      const html = await get(url)
      if (!html) continue
      for (const e of jsonLdEvents(html)) {
        const start = new Date(e.startDate)
        if (isNaN(start.getTime()) || start.getTime() < now) continue
        const end = e.endDate ? new Date(e.endDate) : null
        const loc = e.location ?? {}
        events.push({
          source: SRC,
          source_id: `${SRC}-${hashStr(url + start.toISOString())}`,
          source_url: url,
          title: stripHtml(e.name).replace(/\s*\/\/\s*/g, ' — ').replace(/\s+/g, ' ').trim(),
          description: stripHtml(e.description ?? '')
            .replace(/&gt;/g, '>').replace(/&#0?10;/g, ' ').replace(/\s+/g, ' ')
            .slice(0, 500) || 'A 10-day Permaculture Design Course at Terra Alta, Sintra.',
          organizer: ORG,
          location_name: [loc.name, typeof loc.address === 'string' ? loc.address : null].filter(Boolean).join(', ') || 'Terra Alta, Sintra',
          lat: LAT,
          lng: LNG,
          starts_at: start.toISOString(),
          ends_at: end && !isNaN(end.getTime()) ? end.toISOString() : null,
          cost: 'See event page',
          image_url: typeof e.image === 'string' ? e.image : e.image?.url ?? null,
        })
      }
    }
    return events
  },
}
