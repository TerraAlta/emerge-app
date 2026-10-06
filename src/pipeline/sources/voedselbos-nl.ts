/**
 * Voedselbosbouw Nederland — food forest courses and field days.
 *
 * The old guesses (voedselbos.nl, voedselbosbouw.nl) don't resolve, and the
 * Green Deal network site (netwerkvoedselbosbouw.nl/agenda) is now only an
 * archive of past knowledge sessions; it points to the association that took
 * over: Voedsel uit het Bos (voedseluithetbos.nl). Its course pages list every
 * upcoming course as a card ("Start: wo 03 mrt 2027", teachers, remarks,
 * price), and each product page names the first day's venue
 * ("3 maart 2027, Kwekerij De Koperwiek, Hazerswoude-Dorp") and usually the
 * daily start time ("Elke cursusdag begint om 10 uur").
 *
 * We read both listing pages, keep in-person, not sold-out, not-yet-started
 * courses, open each product page (≤ ~20), and geocode the first venue with
 * Nominatim (≥1.1 s apart, cached). Courses whose venue we can't place in the
 * Netherlands are skipped. When no start time is given we assume 10:00 (all
 * listed courses are full-day sessions that start at 10).
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'voedselbos-nl'
const BASE = 'https://voedseluithetbos.nl'
const LISTINGS = [`${BASE}/cursussen/`, `${BASE}/verdiepende-cursussen/`]
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)' // the host's WAF 403s UAs containing "compatible;"
const NOMINATIM_UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_DETAIL = 20

const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7,
  augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
  jan: 1, feb: 2, mrt: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, okt: 10, nov: 11, dec: 12,
}
const MONTH_RX = 'januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december'

async function getText(url: string): Promise<string | null> {
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

function amsOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Amsterdam', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** Europe/Amsterdam wall-clock time → UTC ISO string */
function amsIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - amsOffsetMin(guess) * 60000).toISOString()
}

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastNominatim = 0
async function nominatim(q: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache.has(q)) return geoCache.get(q)!
  const wait = lastNominatim + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastNominatim = Date.now()
  let out: { lat: number; lng: number } | null = null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=nl&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'nl' }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      if (d[0]) out = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
    }
  } catch { /* none */ }
  geoCache.set(q, out)
  return out
}

/** Venue string → candidate geocoder queries, most specific first */
function venueQueries(venue: string): string[] {
  const v = venue.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  const qs = [v]
  const inTown = v.match(/\b(?:in|bij|te) ([A-Z][\w'’-]+(?:[ -][A-Z][\w'’-]+)*)\s*$/)?.[1]
  const parts = v.split(/,| en /).map((s) => s.trim()).filter(Boolean)
  const last = parts[parts.length - 1]
  if (parts.length > 1) qs.push(`${parts[0].replace(/\b(?:in|bij|te) [A-Z].*$/, '').trim()}, ${inTown ?? last}`)
  if (inTown) qs.push(inTown)
  if (last && last !== v) qs.push(last)
  return [...new Set(qs.filter((q) => q.length > 2))]
}

function isoDate([y, m, d]: [number, number, number]): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

interface Card {
  url: string
  title: string
  start: [number, number, number]
  teachers: string
  remarks: string
  price: string
}

function parseCards(html: string): Card[] {
  const out: Card[] = []
  const rx = /<a href="(https:\/\/voedseluithetbos\.nl\/product\/[^"]+)"[^>]*>([\s\S]*?)<\/a><\/div>/g
  for (const m of html.matchAll(rx)) {
    const body = m[2]
    if (/Uitverkocht/i.test(body.match(/^[\s\S]*?<h2/)?.[0] ?? '')) continue
    const title = stripHtml(body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '')
    const sm = stripHtml(body).match(/Start:\s*\w+\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/i)
    const mo = sm ? MONTHS[sm[2].toLowerCase()] : undefined
    if (!title || !sm || !mo) continue
    const teachers = stripHtml(body.match(/Docenten:<\/aside>([\s\S]*?)<\/div><\/div>/)?.[1] ?? '').replace(/\s*,\s*/g, ', ')
    const remarks = stripHtml(body.match(/Opmerkingen<\/aside>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '')
    const price = stripHtml(body.match(/<span class="woocommerce-Price-amount[\s\S]*?<\/bdi>/)?.[0] ?? '')
    out.push({ url: m[1], title, start: [+sm[3], mo, +sm[1]], teachers, remarks, price })
  }
  return out
}

interface Detail { venue: string | null; time: [number, number] | null; end: [number, number] | null; summary: string }

function parseDetail(html: string, card: Card): Detail {
  const text = stripHtml(
    html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/g, ' ')
      .replace(/<(br|p|div|h\d|li)[^>]*>/gi, ' | '),
  )
  const [, mo, d] = card.start
  const monthName = MONTH_RX.split('|')[mo - 1]

  // Venue of the first course day: "<d> <maand> <yyyy>, <venue> |"
  let venue: string | null = null
  const dayRx = new RegExp(`\\b0?${d}\\s+(?:${monthName})(?:\\s+\\d{4})?,\\s*([^|]{3,140})`, 'gi')
  for (const dm of text.matchAll(dayRx)) {
    const cand = dm[1].trim()
    // skip date lists ("19 maart, 2 april en …"), times and online days
    if (/^(\d|van\s+\d|online|digitaal)/i.test(cand)) continue
    venue = cand
    break
  }
  if (!venue) {
    const addr = text.match(/(?:het adres is|adres:|locatie:)\s*([^|.]{5,120})/i)?.[1]
    if (addr && !/online/i.test(addr)) venue = addr.trim()
  }

  // Start/end time
  let time: [number, number] | null = null
  let end: [number, number] | null = null
  const range = text.match(/\bvan\s+(\d{1,2})[.:](\d{2})\s+tot\s+(\d{1,2})[.:](\d{2})\s*uur/i)
  const begins = text.match(/(?:begint|starten|start)\s+om\s+(\d{1,2})(?:[.:](\d{2}))?\s*uur/i)
  if (range) { time = [+range[1], +range[2]]; end = [+range[3], +range[4]] }
  else if (begins) time = [+begins[1], +(begins[2] ?? 0)]

  const summary = (stripHtml(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '')
    || stripHtml(html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ?? '')).slice(0, 300)
  return { venue, time, end, summary: summary.length > 20 ? summary : '' }
}

export const voedselbosNl: SourceFetcher = {
  name: SRC,
  async fetch() {
    const cards = new Map<string, Card>()
    for (const url of LISTINGS) {
      const html = await getText(url)
      if (!html) continue
      for (const c of parseCards(html)) if (!cards.has(c.url)) cards.set(c.url, c)
    }

    const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
    const candidates = [...cards.values()]
      .filter((c) => isoDate(c.start) >= tomorrow)
      .filter((c) => !/\bonline\b|webinar/i.test(c.title))
      .filter((c) => !/uitverkocht|\bvol\b|is gestart|al gestart|online lesdag|geheel online/i.test(c.remarks))
      .sort((a, b) => isoDate(a.start).localeCompare(isoDate(b.start)))
      .slice(0, MAX_DETAIL)

    const events: RawEvent[] = []
    for (const c of candidates) {
      const html = await getText(c.url)
      if (!html) continue
      const det = parseDetail(html, c)
      if (!det.venue) continue
      let geo: { lat: number; lng: number } | null = null
      for (const q of venueQueries(det.venue)) {
        geo = await nominatim(q)
        if (geo) break
      }
      if (!geo || !(geo.lat > 50.7 && geo.lat < 53.6 && geo.lng > 3.3 && geo.lng < 7.3)) continue

      const [y, mo, d] = c.start
      const [h, mi] = det.time ?? [10, 0]
      const startsAt = amsIso(y, mo, d, h, mi)
      const endsAt = det.end ? amsIso(y, mo, d, det.end[0], det.end[1]) : null
      const slug = c.url.replace(/\/$/, '').split('/').pop()
      events.push({
        source: SRC,
        source_id: `vuhb-${slug}-${y}${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}`,
        source_url: c.url,
        title: c.title,
        description: [
          det.summary,
          c.teachers ? `Docenten: ${c.teachers}.` : '',
          c.remarks,
          'Cursus van Voedsel uit het Bos (vereniging voor voedselbosbouw).',
        ].filter(Boolean).join(' ').slice(0, 600),
        organizer: 'Voedsel uit het Bos',
        location_name: det.venue.slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startsAt,
        ends_at: endsAt && endsAt > startsAt ? endsAt : null,
        cost: c.price ? `${c.price} excl. btw` : 'Zie website',
      })
    }
    return events
  },
}
