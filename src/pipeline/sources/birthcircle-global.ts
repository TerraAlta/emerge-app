/**
 * Birth Circle — birthcircle.com — live birth classes, doula meet-ups,
 * postpartum circles and birth-worker gatherings posted by birth workers
 * (mostly Utah / US so far).
 *
 * The /events calendar (FullCalendar) loads its data from
 *   POST https://birthcircle.com/events/ajax   start=<unix> end=<unix>
 *   → {"success":true,"events":[{"id","title","start":"2026-04-18T15:00:00+00:00","end",…,"url":"/events/view/314"}]}
 * Times are UTC (with offset), so no time-zone guessing. Each detail page
 * (/events/view/<id>) has: <strong>Overview</strong><p>…</p>, then labelled
 * fields Date / Time / Event Category / Price / Venue (street<br/>city, st zip).
 * Events without a venue (online classes) are skipped; venues are geocoded.
 * The board is sparse — weeks can pass with no upcoming entries.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { UA, getText, geocodeWorldFirst, ONLINE_RE } from './global-common'

const SRC = 'birthcircle-global'
const BASE = 'https://birthcircle.com'
const MAX_DETAILS = 25

interface CalEvent { id: string; title: string; start: string; end?: string; url?: string }

function label(html: string, name: string): string {
  const m = html.match(new RegExp(`<label>${name}</label>\\s*<div class="form-control-static">([\\s\\S]*?)</div>\\s*(?:<a|</div>)`))
  return m ? m[1] : ''
}

/** Calendar entries between two unix timestamps (seconds). Exported for testing. */
export async function birthcircleCalendar(startSec: number, endSec: number): Promise<CalEvent[]> {
  try {
    const res = await fetch(`${BASE}/events/ajax`, {
      method: 'POST',
      headers: {
        'User-Agent': UA, Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest',
      },
      body: `start=${startSec}&end=${endSec}`,
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return []
    const d = await res.json()
    return d?.success && Array.isArray(d.events) ? d.events : []
  } catch {
    return []
  }
}

export async function birthcircleEvents(cal: CalEvent[], minStartMs: number): Promise<RawEvent[]> {
  const events: RawEvent[] = []
  const seen = new Set<string>()
  let details = 0
  for (const c of cal.sort((a, b) => a.start.localeCompare(b.start))) {
    const startMs = Date.parse(c.start)
    if (!Number.isFinite(startMs) || startMs < minStartMs || !c.title) continue
    if (ONLINE_RE.test(c.title)) continue
    const key = `${c.id}|${c.start}`
    if (seen.has(key)) continue
    seen.add(key)
    if (details >= MAX_DETAILS) break
    details++
    const url = new URL(c.url || `/events/view/${c.id}`, BASE).toString()
    const html = await getText(url)
    if (!html) continue

    const venueLines = (label(html, 'Venue').match(/<div>([\s\S]*?)<\/div>/)?.[1] ?? label(html, 'Venue'))
      .split(/<br\s*\/?>/i).map((s) => stripHtml(s)).filter(Boolean)
    if (!venueLines.length) continue
    const venue = venueLines.join(', ')
    const category = stripHtml(label(html, 'Event Category'))
    const price = stripHtml(label(html, 'Price'))
    const overview = stripHtml(html.match(/<strong>Overview<\/strong><\/div>\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? '')
    if (ONLINE_RE.test(`${category} ${venue}`)) continue

    const cityLine = venueLines[venueLines.length - 1]
    const geo = await geocodeWorldFirst([venue, cityLine])
    if (!geo) continue
    const endMs = c.end ? Date.parse(c.end) : NaN

    events.push({
      source: SRC,
      source_id: `bc-${c.id}-${new Date(startMs).toISOString().slice(0, 10)}`,
      source_url: url,
      title: stripHtml(c.title),
      description: [overview.slice(0, 800), category ? `Category: ${category}.` : ''].filter(Boolean).join(' ')
        || `${stripHtml(c.title)} — a live birth / postpartum community event listed on Birth Circle.`,
      organizer: 'Birth Circle community',
      location_name: venue,
      lat: geo.lat,
      lng: geo.lng,
      starts_at: new Date(startMs).toISOString(),
      ends_at: Number.isFinite(endMs) && endMs > startMs ? new Date(endMs).toISOString() : null,
      cost: price ? (/^free$/i.test(price) ? 'Free' : price) : 'See event page',
    })
  }
  return events
}

export const birthcircleGlobal: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = Date.now()
    const cal = await birthcircleCalendar(Math.floor(now / 1000), Math.floor(now / 1000) + 365 * 86400)
    return birthcircleEvents(cal, now + 3600_000)
  },
}
