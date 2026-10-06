/**
 * Dutch community music & art spaces — OCCII Amsterdam, WORM Rotterdam
 *
 * - OCCII (Events Manager): /events.ics lists every upcoming event with UTC
 *   start/end, URL, category (music, party, course/workshop…) and description.
 *   Its LOCATION field is an unfilled template, so we use the venue's fixed
 *   location (Amstelveenseweg 134, Amsterdam).
 * - WORM (WordPress "Theater" plugin): /agenda/ lists productions with
 *   category; each production page has the full date ("Tue 6 October 2026"),
 *   location and "Start → 16:00 / End → 21:00". We open up to 25 of them.
 *   Events at WORM use the venue's location (Boomgaardsstraat 71, Rotterdam);
 *   elsewhere we geocode "<location>, Rotterdam" with Nominatim or skip.
 *
 * Club nights / DJ sets / broadcasts are dropped; times are Europe/Amsterdam.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_PER_SPACE = 100
const MAX_WORM_DETAIL = 25

const OCCII = { name: 'occii', org: 'OCCII', city: 'Amsterdam', address: 'Amstelveenseweg 134, Amsterdam', lat: 52.35434, lng: 4.85534 }
const WORM = { name: 'worm-rotterdam', org: 'WORM', city: 'Rotterdam', address: 'Boomgaardsstraat 71, Rotterdam', lat: 51.91564, lng: 4.47649 }

const EXCLUDE_RX = /club night|dj set|\bdj\b|techno|house music|rave|corporate|sponsor|VIP/i

const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
}

async function getText(url: string, accept = 'text/html'): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: accept },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function amsOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Amsterdam', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

function amsIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - amsOffsetMin(guess) * 60000).toISOString()
}

// ── OCCII (iCal) ───────────────────────────────────────────────────────────

function icsUtc(v: string | undefined): string | null {
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (!m) return null // OCCII exports UTC; anything else we don't trust
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString()
}

const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')

async function fetchOccii(): Promise<RawEvent[]> {
  const text = await getText('https://occii.org/events.ics', 'text/calendar')
  if (!text) return []
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const out: RawEvent[] = []
  let cur: Record<string, string> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT' && cur) {
      const title = unesc(cur.SUMMARY ?? '').trim()
      const start = icsUtc(cur.DTSTART)
      const end = icsUtc(cur.DTEND)
      const cat = unesc(cur.CATEGORIES ?? '')
      const desc = stripHtml(unesc(cur.DESCRIPTION ?? '')).replace(/\s+/g, ' ')
      if (title && start && !/party/i.test(cat) && !EXCLUDE_RX.test(title) && !/\b(online|livestream)\b/i.test(title)) {
        out.push({
          source: OCCII.name,
          source_id: `occii-${(cur.UID ?? title).replace(/@.*/, '')}`,
          source_url: cur.URL?.trim() || 'https://occii.org/events/',
          title,
          description: (desc || `${cat} at ${OCCII.org}, ${OCCII.city}.`).slice(0, 500),
          organizer: OCCII.org,
          location_name: `${OCCII.org}, ${OCCII.address}`,
          lat: OCCII.lat,
          lng: OCCII.lng,
          starts_at: start,
          ends_at: end && end > start ? end : null,
          cost: 'See event page',
        })
      }
      cur = null
      continue
    }
    if (!cur) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).split(';')[0].toUpperCase()
    if (!(key in cur)) cur[key] = line.slice(idx + 1)
  }
  return out
}

// ── WORM (agenda + production pages) ───────────────────────────────────────

const WORM_SKIP_CATS = /club|broadcast|stream/i

let lastNominatim = 0
const geoCache = new Map<string, { lat: number; lng: number } | null>()
async function nominatim(q: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache.has(q)) return geoCache.get(q)!
  const wait = lastNominatim + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastNominatim = Date.now()
  let out: { lat: number; lng: number } | null = null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=nl&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      if (d[0]) out = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
    }
  } catch { /* none */ }
  geoCache.set(q, out)
  return out
}

async function fetchWorm(): Promise<RawEvent[]> {
  const html = await getText('https://worm.org/agenda/')
  if (!html) return []
  const items: Array<{ url: string; title: string; cat: string }> = []
  const seen = new Set<string>()
  for (const m of html.matchAll(/<a class="agenda-item__link ajax-link" href="([^"]+)">\s*<h2 class="agenda-item__title__title">([\s\S]*?)<\/h2>[\s\S]*?<div class="agenda-item__title__cat">([\s\S]*?)<\/div>/g)) {
    const url = m[1]
    const title = stripHtml(m[2])
    const cat = stripHtml(m[3])
    if (seen.has(url) || !title) continue
    seen.add(url)
    if (WORM_SKIP_CATS.test(cat) || EXCLUDE_RX.test(title)) continue
    items.push({ url, title, cat })
  }

  const now = Date.now()
  const out: RawEvent[] = []
  for (const it of items.slice(0, MAX_WORM_DETAIL)) {
    const page = await getText(it.url)
    if (!page) continue
    // "<a>Film</a> - Tue 6 October 2026 <div class=…tickets>"
    const dateTxt = stripHtml(page.match(/agenda-single-meta__date">([\s\S]*?)<div/)?.[1] ?? '')
    const dm = dateTxt.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
    const st = stripHtml(page.match(/agenda-single-meta__start">([\s\S]*?)<\/div>/)?.[1] ?? '').match(/(\d{1,2}):(\d{2})/)
    const en = stripHtml(page.match(/agenda-single-meta__end">([\s\S]*?)<\/div>/)?.[1] ?? '').match(/(\d{1,2}):(\d{2})/)
    const mo = dm ? EN_MONTHS[dm[2].toLowerCase()] : undefined
    if (!dm || !mo || !st) continue
    const startsAt = amsIso(+dm[3], mo, +dm[1], +st[1], +st[2])
    if (Date.parse(startsAt) < now + 3600_000) continue
    let endsAt = en ? amsIso(+dm[3], mo, +dm[1], +en[1], +en[2]) : null
    if (endsAt && endsAt <= startsAt) endsAt = new Date(Date.parse(endsAt) + 864e5).toISOString() // past midnight

    const location = stripHtml(page.match(/agenda-single-meta__location">([\s\S]*?)<\/div>/)?.[1] ?? '') || 'WORM Rotterdam'
    if (/online|stream/i.test(location)) continue
    let lat = WORM.lat
    let lng = WORM.lng
    let locName = `${WORM.org}, ${WORM.address}`
    if (!/\bworm\b/i.test(location)) {
      const g = await nominatim(`${location}, Rotterdam`)
      if (!g) continue
      lat = g.lat; lng = g.lng; locName = `${location}, Rotterdam`
    }
    const subtitle = stripHtml(page.match(/agenda-single-meta__subtitle">([\s\S]*?)<\/div>/)?.[1] ?? '')
    const body = stripHtml(page.match(/<div class="single-container__content__other[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? '')
    const slug = it.url.replace(/\/$/, '').split('/').pop()
    out.push({
      source: WORM.name,
      source_id: `worm-${slug}-${startsAt.slice(0, 10)}`,
      source_url: it.url,
      title: it.title,
      description: [subtitle, `${it.cat} at ${WORM.org} Rotterdam.`, body].filter(Boolean).join(' ').slice(0, 500),
      organizer: WORM.org,
      location_name: locName,
      lat, lng,
      starts_at: startsAt,
      ends_at: endsAt,
      cost: 'See event page',
    })
  }
  return out
}

export const nlArtSpaces: SourceFetcher = {
  name: 'nl-art-spaces',
  async fetch() {
    const now = Date.now()
    const occii = (await fetchOccii()).filter((e) => Date.parse(e.starts_at) > now + 3600_000).slice(0, MAX_PER_SPACE)
    const worm = (await fetchWorm()).slice(0, MAX_PER_SPACE)
    return [...occii, ...worm]
  },
}
