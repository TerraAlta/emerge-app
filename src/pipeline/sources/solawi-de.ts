/**
 * Netzwerk Solidarische Landwirtschaft (Solawi / CSA Germany)
 * https://www.solidarische-landwirtschaft.org
 *
 * The network's "Termine" page lists events from the network and the wider
 * Solawi movement (open farm days, field walks, workshops, Netzwerktreffen…):
 *   /vernetzung/events/termine/  (TYPO3 EXT:news, ~20 items/page, paginated)
 * Each list item has <time datetime="YYYY-MM-DD"> (= start day), a visible
 * "dd.mm.yy" (= end day), an optional "| place" and the title, usually with
 * the town in brackets: "Workshop: … (Göttingen)".
 * For upcoming in-person items we open the detail page to find a start time
 * ("14:30 Uhr") and a postal address ("Wo: … 37073 Göttingen"), then geocode
 * via Nominatim (cached, ≥1.1 s apart). Online items are skipped.
 *
 * NOTE: the site answers 403 to browser-like User-Agents but serves our
 * honest bot UA fine.
 * Requests: ≤ 4 list pages + ≤ 24 detail pages + geocoding.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities, hashStr } from './utils'

const SRC = 'solawi-de'
const BASE = 'https://www.solidarische-landwirtschaft.org'
const LIST = `${BASE}/vernetzung/events/termine/`
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_PAGES = 4
const MAX_DETAIL = 24
const DEFAULT_HOUR = 10 // assumed local start when the page gives no time

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

// ── Europe/Berlin wall clock → UTC ────────────────────────────────────────
function berlinOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}
function berlinIso(y: number, mo: number, d: number, h = 0, mi = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - berlinOffsetMin(guess) * 60000
  return new Date(guess - berlinOffsetMin(first) * 60000).toISOString()
}

// ── Nominatim (cached, polite) ────────────────────────────────────────────
const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastGeo = 0
/** After repeated 429s (shared IP), skip Nominatim for a while and use Photon. */
let nominatimPausedUntil = 0
const inDach = (lat: number, lng: number) => lat > 45.5 && lat < 55.2 && lng > 5.5 && lng < 17.5

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  const query = q.replace(/\s+/g, ' ').trim()
  if (!query) return null
  if (geoCache.has(query)) return geoCache.get(query)!
  for (let attempt = 0; attempt < 2 && Date.now() >= nominatimPausedUntil; attempt++) {
    const wait = lastGeo + 1100 + attempt * 4000 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de,at,ch&q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'de' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 1) nominatimPausedUntil = Date.now() + 15 * 60000
        continue
      }
      if (!res.ok) break
      const d = await res.json()
      const lat = parseFloat(d?.[0]?.lat)
      const lng = parseFloat(d?.[0]?.lon)
      const out = Number.isFinite(lat) && Number.isFinite(lng) && inDach(lat, lng) ? { lat, lng } : null
      geoCache.set(query, out)
      return out
    } catch { /* retry */ }
  }
  // Fallback: Photon (komoot's free OSM geocoder), bounded to DE/AT/CH
  for (let attempt = 0; attempt < 2; attempt++) {
    const pw = lastGeo + 1100 + attempt * 3000 - Date.now()
    if (pw > 0) await new Promise((r) => setTimeout(r, pw))
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?limit=1&lang=de&bbox=5.8,45.8,17.2,55.1&q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
      )
      if (!res.ok) continue
      const d = await res.json()
      const c = d?.features?.[0]?.geometry?.coordinates
      const out = Array.isArray(c) && inDach(c[1], c[0]) ? { lat: c[1], lng: c[0] } : null
      geoCache.set(query, out)
      return out
    } catch { /* retry */ }
  }
  return null
}

// ── List parsing ──────────────────────────────────────────────────────────
interface Item {
  url: string
  title: string
  teaser: string
  place: string
  start: { y: number; m: number; d: number }
  end: { y: number; m: number; d: number } | null
  image: string | null
}

const ONLINE_RX = /\b(online|webinar|web-seminar|videokonferenz|zoom|digital)\b/i
const HYBRID_RX = /(und|&|\+|\/)\s*online|hybrid|präsenz/i

function parseList(html: string): { items: Item[]; next: string | null } {
  const items: Item[] = []
  const blocks = html.split(/<!-- Partials\/List\/Item\.html -->/).slice(1)
  for (const b of blocks) {
    const iso = b.match(/<time datetime="(\d{4})-(\d{2})-(\d{2})"/)
    const link = b.match(/<h4>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!iso || !link) continue
    const dateSpan = b.match(/<span class="news-list-date">([\s\S]*?)<\/span>\s*(?:<\/span>|<span)/)?.[1] ?? ''
    // "dd.mm.yy" inside <time> is the END day; a start day may precede it
    const shown = (dateSpan.match(/<time[^>]*>([\s\S]*?)<\/time>/)?.[1] ?? '').match(/(\d{2})\.(\d{2})\.(\d{2})\b/)
    const afterTime = dateSpan.split('</time>')[1] ?? ''
    const place = stripHtml(afterTime).replace(/^\|\s*/, '').trim()
    const start = { y: +iso[1], m: +iso[2], d: +iso[3] }
    let end: Item['end'] = null
    if (shown) {
      const e = { y: 2000 + +shown[3], m: +shown[2], d: +shown[1] }
      if (Date.UTC(e.y, e.m - 1, e.d) > Date.UTC(start.y, start.m - 1, start.d)) end = e
    }
    const teaser = stripHtml(
      (b.match(/<div class="teaser-text">([\s\S]*?)<\/div>/)?.[1] ?? '').replace(/<a class="more"[\s\S]*?<\/a>/, ''),
    )
    const img = b.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null
    items.push({
      url: new URL(decodeEntities(link[1]), BASE).toString(),
      title: stripHtml(link[2]),
      teaser,
      place,
      start,
      end,
      image: img ? new URL(decodeEntities(img), BASE).toString() : null,
    })
  }
  const nextHref = html.match(/<li class="next">\s*<a href="([^"]+)"/)?.[1]
  return { items, next: nextHref ? new URL(decodeEntities(nextHref), BASE).toString() : null }
}

// ── Detail parsing ────────────────────────────────────────────────────────
function detailText(html: string): string {
  const i = html.indexOf('news-text-wrap')
  const chunk = i >= 0 ? html.slice(i, i + 20000) : ''
  return decodeEntities(
    chunk
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|td|tr|li|div|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/ /g, ' ').replace(/[ \t]+/g, ' ')
}

/** First clock time in the "Wann" section (or the whole text). */
function findTime(text: string): { h: number; mi: number } | null {
  const wann = text.match(/Wann:?([\s\S]{0,250})/i)?.[1]
  for (const t of [wann, text]) {
    if (!t) continue
    const m = t.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:Uhr|h\b|–|-|bis)/) ?? t.match(/\b([01]?\d|2[0-3])\s*Uhr/)
    if (m) return { h: +m[1], mi: m[2] && /^\d{2}$/.test(m[2]) ? +m[2] : 0 }
  }
  return null
}

/** Address lines after "Wo:" / "Ort:", or any "12345 Town" in the text. */
function findAddress(text: string): string | null {
  const wo = text.match(/(?:\bWo|\bOrt|Veranstaltungsort|Adresse)\s*:\s*([\s\S]{0,200})/i)?.[1]
  for (const t of [wo, text]) {
    if (!t) continue
    const m = t.match(/((?:[A-ZÄÖÜ][\wäöüß.\- ]{2,50}\s\d+[a-z]?\s*,?\s*\n?\s*)?)\b(\d{5})\s+([A-ZÄÖÜ][\wäöüß\-]+(?:[ \-][A-ZÄÖÜ(][\wäöüß\-()]+)*)/)
    if (m) {
      const street = m[1].replace(/\s+/g, ' ').replace(/,\s*$/, '').trim()
      return [street, `${m[2]} ${m[3]}`].filter(Boolean).join(', ')
    }
  }
  return null
}

function placeFromTitle(title: string): string | null {
  const m = title.match(/\(([^()]+)\)\s*$/)
  if (!m || ONLINE_RX.test(m[1])) return null
  return m[1]
}

function cleanPlace(s: string): string {
  return s
    .replace(/\b(und|&)\s*online\b/gi, '')
    .replace(/\bbei\s+/gi, '')
    .replace(/\s*\/\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const solawiDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = new Date()
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

    // 1. Collect upcoming in-person items from the list pages
    const items: Item[] = []
    let url: string | null = LIST
    for (let p = 0; p < MAX_PAGES && url; p++) {
      const html = await getText(url)
      if (!html) break
      const { items: pageItems, next } = parseList(html)
      items.push(...pageItems)
      url = next
    }

    const seen = new Set<string>()
    const upcoming = items.filter((it) => {
      if (seen.has(it.url)) return false
      seen.add(it.url)
      if (Date.UTC(it.start.y, it.start.m - 1, it.start.d) < today) return false // past or already-running series
      const label = `${it.title} ${it.place}`
      if (ONLINE_RX.test(label) && !HYBRID_RX.test(label)) return false
      return true
    })

    // 2. Details + geocoding
    const out: RawEvent[] = []
    for (const it of upcoming.slice(0, MAX_DETAIL)) {
      const html = await getText(it.url)
      const text = html ? detailText(html) : ''
      if (text && /\bonline\b/i.test(text.slice(0, 600)) && !HYBRID_RX.test(text) && !findAddress(text)) {
        if (process.env.DEBUG_SOURCES) console.warn(`[${SRC}] online-only, skipped: ${it.title}`)
        continue
      }

      const time = text ? findTime(text) : null
      const address = text ? findAddress(text) : null
      const placeHint = it.place && !ONLINE_RX.test(it.place) ? cleanPlace(it.place) : null
      const titlePlace = placeFromTitle(it.title)

      const queries: string[] = []
      if (address) {
        queries.push(address)
        const plzCity = address.match(/\d{5} .+$/)?.[0]
        if (plzCity) queries.push(plzCity)
      }
      if (placeHint) queries.push(placeHint, placeHint.split(',').pop()!.trim())
      if (titlePlace) queries.push(cleanPlace(titlePlace), cleanPlace(titlePlace).split(',').pop()!.trim())
      let geo: { lat: number; lng: number } | null = null
      for (const q of [...new Set(queries.filter(Boolean))]) {
        geo = await geocode(q)
        if (geo) break
      }
      if (!geo) {
        console.warn(`[${SRC}] no coordinates for "${it.title}" — skipped`)
        continue // never emit 0,0
      }

      const { y, m, d } = it.start
      const startsAt = time ? berlinIso(y, m, d, time.h, time.mi) : berlinIso(y, m, d, DEFAULT_HOUR, 0)
      const endsAt = it.end ? berlinIso(it.end.y, it.end.m, it.end.d, 17, 0) : null

      const body = text.replace(/\n\s*\n+/g, '\n').trim()
      out.push({
        source: SRC,
        source_id: `solawi-${hashStr(it.url)}`,
        source_url: it.url,
        title: it.title,
        description: (it.teaser || body).slice(0, 1500) || 'Veranstaltung aus dem Netzwerk Solidarische Landwirtschaft.',
        organizer: 'Netzwerk Solidarische Landwirtschaft',
        location_name: address ?? placeHint ?? titlePlace ?? 'Deutschland',
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startsAt,
        ends_at: endsAt,
        cost: /kostenfrei|kostenlos|eintritt frei/i.test(`${it.teaser} ${body}`) ? 'Free' : 'See event page',
        image_url: it.image,
      })
    }
    return out
  },
}
