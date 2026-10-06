/**
 * Theatre of the Oppressed NYC — www.tonyc.nyc (NationBuilder site)
 *
 * The calendar at /events lists upcoming events as <li class="list-item">
 * (month/day badge, link to the event page, time, place). The listing has
 * no year, so we read each event page: NationBuilder event pages carry
 * og:start_time (ISO with the NY offset) plus og:latitude/longitude and the
 * street address. Course-style pages (e.g. the Level 1 training) are plain
 * pages without og: event tags; for those we parse the WHEN block
 * ("October 05, 2026 at 5:30pm - October 18, 2026") as America/New_York
 * time and geocode the WHERE text with Nominatim.
 *
 * Zoom-only sessions are skipped; hybrid "Zoom & Midtown Manhattan"
 * trainings are kept (they meet in person).
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'tonyc-usa'
const BASE = 'https://www.tonyc.nyc'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0; +https://emerge.terralta.org)'
const NOMINATIM_UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const ORG = 'Theatre of the Oppressed NYC'
const MAX_DETAIL = 20

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
}

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function nyOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

function nyIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - nyOffsetMin(guess) * 60000).toISOString()
}

function to24(h: number, ampm: string): number {
  const pm = ampm.toLowerCase() === 'pm'
  if (h === 12) return pm ? 12 : 0
  return pm ? h + 12 : h
}

/** "November 09, 2026 at 6:00pm - 8pm" / "October 05, 2026 at 5:30pm - October 18, 2026" */
function parseWhen(txt: string): { start: string; end: string | null } | null {
  const m = txt.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!m) return null
  const mo = MONTHS[m[1].toLowerCase()]
  if (!mo) return null
  const y = +m[3], d = +m[2]
  const start = nyIso(y, mo, d, to24(+m[4], m[6]), m[5] ? +m[5] : 0)
  let end: string | null = null
  const rest = txt.slice((m.index ?? 0) + m[0].length)
  const sameDay = rest.match(/^\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  const otherDay = rest.match(/^\s*-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm))?/i)
  if (sameDay) {
    end = nyIso(y, mo, d, to24(+sameDay[1], sameDay[3]), sameDay[2] ? +sameDay[2] : 0)
  } else if (otherDay && MONTHS[otherDay[1].toLowerCase()] && otherDay[4]) {
    end = nyIso(+otherDay[3], MONTHS[otherDay[1].toLowerCase()], +otherDay[2],
      to24(+otherDay[4], otherDay[6]), otherDay[5] ? +otherDay[5] : 0)
  }
  if (end && end <= start) end = null
  return { start, end }
}

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastGeo = 0
async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache.has(q)) return geoCache.get(q)!
  const wait = 1100 - (Date.now() - lastGeo)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastGeo = Date.now()
  let out: { lat: number; lng: number } | null = null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': NOMINATIM_UA }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      if (Array.isArray(d) && d[0]) {
        const lat = parseFloat(d[0].lat), lng = parseFloat(d[0].lon)
        // Greater NYC sanity box
        if (lat > 40.3 && lat < 41.2 && lng > -74.5 && lng < -73.5) out = { lat, lng }
      }
    }
  } catch { /* ignore */ }
  geoCache.set(q, out)
  return out
}

const ONLINE_ONLY = /zoom|online|virtual|webinar/i
const IN_PERSON = /manhattan|brooklyn|queens|bronx|staten island|new york|\bny\b|nyc/i

export const tonycUsa: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await get(`${BASE}/events`)
    if (!html) return []
    const $ = load(html)

    const items: Array<{ url: string; title: string; info: string }> = []
    const seen = new Set<string>()
    $('ul.events-list li.list-item').each((_, li) => {
      const a = $(li).find('p.event-info a').first()
      const href = a.attr('href')
      const title = stripHtml(a.text())
      if (!href || !title) return
      const url = new URL(href, BASE).toString()
      if (seen.has(url)) return
      seen.add(url)
      const info = $(li).find('p.event-info').text().replace(/\s+/g, ' ').trim()
      items.push({ url, title, info })
    })

    const events: RawEvent[] = []
    for (const it of items.slice(0, MAX_DETAIL)) {
      // Listing place line, e.g. "Zoom sent to registered participants"
      if (ONLINE_ONLY.test(it.info) && !IN_PERSON.test(it.info.replace(it.title, ''))) continue

      const page = await get(it.url)
      if (!page) continue
      const d = load(page)
      const meta = (p: string) => d(`meta[property="${p}"]`).attr('content')?.trim() || ''

      const whenTxt = d('.event-detail').filter((_, el) => /WHEN/i.test(d(el).find('.subhead').text()))
        .find('.subtext').text().replace(/\s+/g, ' ').trim()
      const whereEl = d('.event-detail').filter((_, el) => /WHERE/i.test(d(el).find('.subhead').text()))
        .find('.subtext').first()
      whereEl.find('a').remove()
      const whereLines = (whereEl.html() ?? '').split(/<br\s*\/?>/i).map((s) => stripHtml(s)).filter(Boolean)
      const where = whereLines.filter((l) => l !== 'United States').join(', ')

      if (where && ONLINE_ONLY.test(where) && !IN_PERSON.test(where)) continue

      // Start: og:start_time carries the offset; else parse WHEN in NY time.
      let starts: string | null = null
      let ends: string | null = null
      const og = meta('og:start_time')
      const parsed = whenTxt ? parseWhen(whenTxt) : null
      if (og) {
        const t = new Date(og)
        if (!isNaN(t.getTime())) starts = t.toISOString()
      }
      if (parsed) {
        if (!starts) starts = parsed.start
        if (parsed.end && parsed.end > starts) ends = parsed.end
      }
      if (!starts) continue

      // Coordinates: og tags, else geocode the WHERE text.
      let lat = parseFloat(meta('og:latitude'))
      let lng = parseFloat(meta('og:longitude'))
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        const place = (where || it.info).replace(/zoom\s*(&|and)?\s*/i, '').trim()
        if (!place) continue
        const g = (await geocode(`${place}, New York, NY`)) ?? (await geocode(place))
        if (!g) continue
        lat = g.lat
        lng = g.lng
      }

      const street = [meta('og:street-address'), meta('og:locality'), meta('og:region')].filter(Boolean).join(', ')
      const locationName = where || street || 'New York, NY'
      const intro = stripHtml(d('#intro').html() ?? '')
      const hybrid = /zoom/i.test(where) ? ' (Hybrid: part online, part in person.)' : ''

      events.push({
        source: SRC,
        source_id: `tonyc-${it.url.replace(/^https?:\/\/[^/]+\//, '').replace(/\W+/g, '-')}-${starts.slice(0, 10)}`,
        source_url: it.url,
        title: it.title || stripHtml(d('#headline h2').first().text()),
        description: ((intro || 'Theatre of the Oppressed NYC event.') + hybrid).slice(0, 500),
        organizer: ORG,
        location_name: locationName.slice(0, 200),
        lat, lng,
        starts_at: starts,
        ends_at: ends,
        cost: 'See event page',
      })
    }
    return events
  },
}
