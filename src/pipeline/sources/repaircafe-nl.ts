/**
 * Repair Café Nederland — dated repair sessions from the regional networks.
 *
 * repaircafe.org itself has no dated sessions: its Events Manager calendar
 * and events.ics are empty, and each café page only has free-text opening
 * hours ("elke eerste woensdag…"). Its /wp-json/v1/map API lists ~550 NL
 * cafés but without dates, so it is a directory, not events.
 *
 * The big city networks do publish real dated sessions:
 *  - repaircafe.amsterdam (Next.js): the home page embeds `initialEvents`
 *    (~4 weeks of sessions for ~45 cafés: date, start/end time, slug) in its
 *    React Server Components payload; /map embeds every café's coordinate and
 *    address. 2 requests.
 *  - repaircafe-utrecht.nl (The Events Calendar): /wp-json/tribe/events/v1
 *    gives ~3 months of sessions for ~20 cafés with venue addresses (no geo),
 *    which we geocode once per venue with Nominatim (≥1.1 s apart, cached).
 *
 * Sessions marked closed/cancelled ("opgeheven", "NIET op …") are skipped.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'repaircafe-nl'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0; +https://emerge.terralta.org)'
const NOMINATIM_UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const AMS = 'https://repaircafe.amsterdam'
const UTR = 'https://repaircafe-utrecht.nl'
const MAX_EVENTS = 200
const CANCELLED_RX = /opgeheven|geannuleerd|afgelast|vervalt|gaat niet door|\bniet\s+op\b|gesloten/i

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

/** Europe/Amsterdam wall-clock time → UTC ISO string */
function amsIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - amsOffsetMin(guess) * 60000).toISOString()
}

/** YYYY-MM-DD of an instant, in Amsterdam */
function amsDate(ts: number): [number, number, number] {
  const s = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
  const [y, m, d] = s.split('-').map(Number)
  return [y, m, d]
}

// ── Nominatim (polite: sequential, ≥1.1 s apart, cached per query) ─────────
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

// ── Amsterdam ──────────────────────────────────────────────────────────────

/** Concatenated, decoded React Server Components payload of a Next.js page */
function rscPayload(html: string): string {
  let out = ''
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try { out += JSON.parse(`"${m[1]}"`) } catch { /* skip chunk */ }
  }
  return out
}

/** Extract the JSON array that starts at `from` (string-aware bracket match) */
function sliceArray(s: string, from: number): unknown[] | null {
  if (from < 0 || s[from] !== '[') return null
  let depth = 0
  let inStr = false
  for (let i = from; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (ch === '\\') i++
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(s.slice(from, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

interface AmsSession {
  date?: string; startTime?: string; endTime?: string
  closedCause?: string; exceptionCause?: string
  name?: string; slug?: string; district?: string
}
interface AmsCafe {
  slug?: string; coordinate?: [number, number]; name?: string; address?: string; district?: string
}

async function fetchAmsterdam(): Promise<RawEvent[]> {
  const home = await getText(`${AMS}/`)
  if (!home) return []
  const map = await getText(`${AMS}/map`)
  if (!map) return []

  const hp = rscPayload(home)
  const mp = rscPayload(map)
  const sessions = (sliceArray(hp, hp.indexOf('"initialEvents":[') + '"initialEvents":'.length) ?? []) as AmsSession[]
  const cafes = (sliceArray(mp, mp.indexOf('"data":[{"slug"') + '"data":'.length) ?? []) as AmsCafe[]
  const bySlug = new Map(cafes.filter((c) => c.slug).map((c) => [c.slug!, c]))

  const out: RawEvent[] = []
  for (const s of sessions) {
    const cafe = s.slug ? bySlug.get(s.slug) : undefined
    const lat = Number(cafe?.coordinate?.[0])
    const lng = Number(cafe?.coordinate?.[1])
    if (!cafe || !(lat > 52 && lat < 52.6 && lng > 4.6 && lng < 5.3)) continue
    if (s.closedCause && s.closedCause !== '$undefined') continue
    const st = s.startTime?.match(/^(\d{1,2}):(\d{2})$/)
    const en = s.endTime?.match(/^(\d{1,2}):(\d{2})$/)
    const ts = Date.parse((s.date ?? '').replace(/^\$D/, ''))
    if (!st || isNaN(ts)) continue
    const [y, mo, d] = amsDate(ts)
    const startsAt = amsIso(y, mo, d, +st[1], +st[2])
    const endsAt = en ? amsIso(y, mo, d, +en[1], +en[2]) : null
    const name = s.name ?? cafe.name ?? 'Repair Café'
    const exception = s.exceptionCause && s.exceptionCause !== '$undefined' ? ` Let op: ${s.exceptionCause}.` : ''
    out.push({
      source: SRC,
      source_id: `rc-ams-${s.slug}-${y}${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}-${st[1]}${st[2]}`,
      source_url: `${AMS}/cafe/${s.slug}`,
      title: /repair|repareer|reparatie/i.test(name) ? name : `Repair Café ${name}`,
      description: `Gratis samen repareren: neem je kapotte spullen mee (elektrische apparaten, kleding, fietsen, speelgoed…) en repareer ze met hulp van vrijwillige reparateurs. Repair Café in Amsterdam ${cafe.district ?? s.district ?? ''}.${exception}`.replace(/\s+\./g, '.'),
      organizer: 'Repair Cafés Amsterdam',
      location_name: [cafe.address, 'Amsterdam'].filter(Boolean).join(', '),
      lat, lng,
      starts_at: startsAt,
      ends_at: endsAt && endsAt > startsAt ? endsAt : null,
      cost: 'Gratis (vrijwillige bijdrage)',
    })
  }
  return out
}

// ── Utrecht ────────────────────────────────────────────────────────────────

interface TribeVenue { id?: number; venue?: string; address?: string; zip?: string; city?: string }
interface TribeEvent {
  id: number; url?: string; title?: string; description?: string
  all_day?: boolean; utc_start_date?: string; utc_end_date?: string
  venue?: TribeVenue | unknown[]; cost?: string
}

const UTRECHT_BOX = { latMin: 51.9, latMax: 52.25, lngMin: 4.85, lngMax: 5.4 }

async function geocodeVenue(v: TribeVenue): Promise<{ lat: number; lng: number } | null> {
  const city = (v.city ?? 'Utrecht').trim()
  const parts = (v.address ?? '').replace(/\([^)]*\)/g, '').split(',').map((p) => p.trim()).filter(Boolean)
  const zip = /^\d{4}\s?[A-Z]{2}$/.test((v.zip ?? '').trim()) ? v.zip!.trim() : ''
  const queries: string[] = []
  const streetParts = parts.filter((p) => /[A-Za-zÀ-ÿ]{3,}.*\s\d+/.test(p))
  for (const p of streetParts.reverse()) {
    const street = p.match(/([A-Za-zÀ-ÿ.'’-]+(?:\s[A-Za-zÀ-ÿ.'’-]+)?\s\d+\s?[A-Za-z]?(?:-\d+)?)\s*$/)?.[1] ?? p
    queries.push(`${street}, ${zip ? `${zip} ` : ''}${city}`)
    if (zip) queries.push(`${street}, ${city}`)
  }
  if (zip) queries.push(`${zip}, ${city}`)
  for (const q of queries) {
    const g = await nominatim(q)
    if (g && g.lat > UTRECHT_BOX.latMin && g.lat < UTRECHT_BOX.latMax && g.lng > UTRECHT_BOX.lngMin && g.lng < UTRECHT_BOX.lngMax) return g
  }
  return null
}

async function fetchUtrecht(): Promise<RawEvent[]> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
  const all: TribeEvent[] = []
  for (let page = 1; page <= 4; page++) {
    const txt = await getText(`${UTR}/wp-json/tribe/events/v1/events?per_page=50&page=${page}&start_date=${today}`, 'application/json')
    if (!txt) break
    let data: { events?: TribeEvent[]; total_pages?: number }
    try { data = JSON.parse(txt) } catch { break }
    all.push(...(data.events ?? []))
    if (!data.total_pages || page >= data.total_pages) break
  }

  const venueGeo = new Map<number, { lat: number; lng: number } | null>()
  const out: RawEvent[] = []
  for (const e of all) {
    const title = stripHtml(e.title ?? '')
    const v = (e.venue && !Array.isArray(e.venue) ? e.venue : null) as TribeVenue | null
    if (!title || !v?.id || e.all_day || CANCELLED_RX.test(title)) continue
    if (!e.utc_start_date) continue
    const startsAt = new Date(e.utc_start_date.replace(' ', 'T') + 'Z')
    if (isNaN(startsAt.getTime())) continue
    const endsAt = e.utc_end_date ? new Date(e.utc_end_date.replace(' ', 'T') + 'Z') : null
    if (!venueGeo.has(v.id)) venueGeo.set(v.id, await geocodeVenue(v))
    const geo = venueGeo.get(v.id)
    if (!geo) continue
    const desc = stripHtml(e.description ?? '').slice(0, 400)
    out.push({
      source: SRC,
      source_id: `rc-utr-${e.id}`,
      source_url: e.url ?? `${UTR}/events/`,
      title,
      description: desc || 'Gratis samen repareren met vrijwillige reparateurs: neem je kapotte spullen mee.',
      organizer: 'Repair Café Utrecht',
      location_name: [v.venue, v.address, v.city].filter(Boolean).join(', ').slice(0, 200),
      lat: geo.lat,
      lng: geo.lng,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt && !isNaN(endsAt.getTime()) && endsAt > startsAt ? endsAt.toISOString() : null,
      cost: stripHtml(e.cost ?? '') || 'Gratis (vrijwillige bijdrage)',
    })
  }
  return out
}

export const repaircafeNl: SourceFetcher = {
  name: SRC,
  async fetch() {
    const ams = await fetchAmsterdam()
    const utr = await fetchUtrecht()
    const now = Date.now()
    const events = [...ams, ...utr]
      .filter((e) => Date.parse(e.starts_at) > now + 3600_000)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return events.slice(0, MAX_EVENTS)
  },
}
