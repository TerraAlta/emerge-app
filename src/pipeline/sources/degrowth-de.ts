/**
 * degrowth.info — the international degrowth web portal (run from Leipzig by
 * Konzeptwerk Neue Ökonomie and partners).
 *
 * https://degrowth.info/en/events has an "Upcoming Events" side bar (the
 * main column is past events, which is why the old scraper only returned past
 * ones):
 *   <div class="col_6"><p class="label">21 – 23 October 2026</p>
 *     <h2><a href="/en/event/slug">Title</a></h2><p class="text">teaser</p></div>
 * Entries with only a month ("June 2027") are skipped. Each event page is read
 * for the place ("Where: Amsterdam, …" or the address line) and a start time
 * ("9:30 - 17:00"); without one, 10:00 local is assumed. Events are
 * international, so the local timezone is taken from the geocoded country.
 * Online events are skipped.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'degrowth-de'
const BASE = 'https://degrowth.info'
const LIST = `${BASE}/en/events`
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_DETAILS = 15

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
}
const TZ: Record<string, string> = {
  gb: 'Europe/London', ie: 'Europe/Dublin', pt: 'Europe/Lisbon', is: 'Atlantic/Reykjavik',
  ro: 'Europe/Bucharest', gr: 'Europe/Athens', bg: 'Europe/Sofia', fi: 'Europe/Helsinki',
  ee: 'Europe/Tallinn', lv: 'Europe/Riga', lt: 'Europe/Vilnius', ua: 'Europe/Kyiv', cy: 'Asia/Nicosia', tr: 'Europe/Istanbul',
}

function offsetMin(tz: string, ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}
/** Wall-clock time in `tz` → UTC ISO (DST aware). */
function zonedIso(tz: string, y: number, mo: number, d: number, h = 0, mi = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - offsetMin(tz, guess) * 60000
  return new Date(guess - offsetMin(tz, first) * 60000).toISOString()
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

type Geo = { lat: number; lng: number; cc: string }
const geoCache = new Map<string, Geo | null>()
let lastGeo = 0
/** Nominatim (worldwide, with country code), ≥1.1 s apart, cached, backs off on 429. */
async function geocode(q: string): Promise<Geo | null> {
  q = q.replace(/\s+/g, ' ').trim()
  if (!q) return null
  if (geoCache.has(q)) return geoCache.get(q)!
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastGeo + 1100 + attempt * 4000 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) continue
      if (!res.ok) return null
      const d = await res.json()
      const lat = parseFloat(d?.[0]?.lat), lng = parseFloat(d?.[0]?.lon)
      const out = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
        ? { lat, lng, cc: String(d[0].address?.country_code ?? '') } : null
      geoCache.set(q, out)
      return out
    } catch { /* retry */ }
  }
  return null
}

/** "21 – 23 October 2026", "17 October 2026", "30 June 2026 – 02 July 2026" */
function parseLabel(s: string) {
  const m = s.match(/^(\d{1,2})(?:\s+([A-Za-z]+))?(?:\s+(\d{4}))?\s*(?:[–-]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}))?$/)
  if (!m) return null
  const mo = MONTHS[(m[2] ?? m[5] ?? '').toLowerCase()]
  const y = +(m[3] ?? m[6] ?? NaN)
  if (!mo || !Number.isFinite(y)) return null
  const end = m[4] ? { y: +m[6], mo: MONTHS[m[5].toLowerCase()], d: +m[4] } : null
  return { y, mo, d: +m[1], end: end && end.mo ? end : null }
}

export const degrowthDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(LIST)
    if (!html) return []
    const at = html.indexOf('Upcoming Events')
    if (at < 0) return []
    const side = html.slice(at)
    const items = [...side.matchAll(/<p class="label">([\s\S]*?)<\/p>\s*<h2><a href="([^"]+)">([\s\S]*?)<\/a><\/h2>\s*(?:<p class="text">([\s\S]*?)<\/p>)?/g)]

    const now = Date.now()
    const events: RawEvent[] = []
    for (const m of items.slice(0, MAX_DETAILS)) {
      const label = stripHtml(m[1])
      const when = parseLabel(label)
      if (!when) continue // month-only ("June 2027") or unparseable
      const title = stripHtml(m[3])
      const teaser = stripHtml(m[4] ?? '')
      if (/\bonline\b|webinar|zoom/i.test(`${title} ${teaser}`)) continue
      const url = new URL(m[2], BASE).toString()

      const page = await getText(url)
      const content = page ? page.slice(page.indexOf('page_content')) : ''
      const text = stripHtml(content.replace(/<\/(p|h\d|div|li)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' '))
      const lines = content
        .replace(/<\/(p|h\d|div|li)>|<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .split('\n').map((l) => stripHtml(l)).filter(Boolean)
      if (/\b(online event|takes? place online|via zoom)\b/i.test(text.slice(0, 600))) continue

      // Place: "Where: …" line, else first line that looks like an address, else "take place in X"
      let place = lines.find((l) => /^Where\s*:/i.test(l))?.replace(/^Where\s*:\s*/i, '') ?? ''
      if (!place) {
        const addr = lines.slice(0, 4).find((l) => /,/.test(l) && l.length < 160 && /\d/.test(l) && !/^When/i.test(l))
        if (addr) place = addr.split(/\.\s/)[0]
      }
      if (!place) place = teaser.match(/take place in ([A-Z][\p{L}-]+(?:,\s*[A-Z][\p{L}-]+)?)/u)?.[1]
        ?? teaser.match(/\bin ([A-Z][\p{L}-]+),? (?:Italy|Spain|Portugal|Romania|Germany|France|Austria|the Netherlands)/u)?.[0]?.slice(3) ?? ''
      if (!place || /online/i.test(place)) continue
      place = place.replace(/Nerthelands/gi, 'Netherlands')
      const parts = place.split(',').map((s) => s.trim()).filter(Boolean)
      let pos: Geo | null = null
      for (const q of [place, parts.slice(-2).join(', '), parts[0]]) {
        if (!q) continue
        pos = await geocode(q)
        if (pos) break
      }
      if (!pos) continue

      const tz = TZ[pos.cc] ?? 'Europe/Berlin'
      const tm = (lines.slice(0, 4).join(' ') + ' ' + teaser).match(/\b(\d{1,2})[:.](\d{2})\s*(AM|PM)?\s*(?:[-–]\s*(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?)?/i)
      let h = 10, mi = 0, eh: number | null = null, emi = 0
      if (tm) {
        h = +tm[1] % 12 + (/pm/i.test(tm[3] ?? '') ? 12 : 0) + (!tm[3] && +tm[1] === 12 ? 12 : 0)
        mi = +tm[2]
        if (tm[4]) { eh = +tm[4] % 12 + (/pm/i.test(tm[6] ?? '') ? 12 : 0) + (!tm[6] && +tm[4] === 12 ? 12 : 0); emi = tm[5] ? +tm[5] : 0 }
        if (h > 23) h = 10
      }
      const start = zonedIso(tz, when.y, when.mo, when.d, h, mi)
      if (Date.parse(start) < now + 3600_000) continue
      let end: string | null = null
      if (when.end) end = zonedIso(tz, when.end.y, when.end.mo, when.end.d, eh ?? 18, eh != null ? emi : 0)
      else if (eh != null && eh <= 23) end = zonedIso(tz, when.y, when.mo, when.d, eh, emi)
      if (end && end <= start) end = null

      events.push({
        source: SRC,
        source_id: `dg-${url.split('/').pop()!.slice(0, 80)}`,
        source_url: url,
        title,
        description: [teaser, text.replace(/\s+/g, ' ').slice(0, 600)].filter(Boolean).join(' ').slice(0, 900),
        organizer: 'degrowth.info',
        location_name: place.slice(0, 200),
        lat: pos.lat,
        lng: pos.lng,
        starts_at: start,
        ends_at: end,
        cost: 'See event page',
      })
    }
    return events
  },
}
