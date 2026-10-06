/**
 * BUND — Bund für Umwelt und Naturschutz Deutschland (bund.net)
 * Germany's big grassroots environmental federation: 16 Landesverbände and
 * ~2,000 local groups running excursions, work days (Pflegeeinsätze),
 * talks, repair cafés, demos, seminars.
 *
 * All BUND sites run the same TYPO3 "bundpool" event extension. We read:
 *  1. the national pool  https://www.bund.net/service/termine/  — events that
 *     the Landesverbände flag for national display (~160, 10 per page), and
 *  2. the larger own pools of a few big Landesverbände (Berlin, NRW) which contain many more local-group dates.
 * Pages are   <base>/event-page/1/?tx_bundpoolevent_display[eventItems][currentPage]=N
 * Each item:
 *   <article class="m-content-dashboardbox"><a href="detail-url">
 *     <p class="...caption">08. - 10. Oktober 2026 um 8-20 Uhr | Ausstellung</p>
 *     <h3 class="...title">Title</h3>
 *     <p class="rte-paragraph">Ort: Weiße Wiek, 23946 Tarnewitz (Boltenhagen)</p>
 * Times are Europe/Berlin local. Entries with no time get an assumed 10:00
 * start. Online/Zoom events are skipped (hybrid ones with a street address are
 * kept). Places are geocoded with Nominatim (postcode + town when present).
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'bund-de'
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_EVENTS = 200
const MAX_PAGE_REQUESTS = 40
const MAX_GEOCODE = 220

interface Pool { base: string; listPath: string; org: string; state?: string }
const POOLS: Pool[] = [
  { base: 'https://www.bund.net', listPath: '/service/termine/', org: 'BUND' },
  { base: 'https://www.bund-berlin.de', listPath: '/service/termine/', org: 'BUND Berlin', state: 'Berlin' },
  { base: 'https://www.bund-nrw.de', listPath: '/termine/', org: 'BUND NRW', state: 'Nordrhein-Westfalen' },
]

/** Landesverband domain → state name (for geocoding hints / organiser). */
const LV: Record<string, [string, string]> = {
  'bund-mecklenburg-vorpommern.de': ['BUND Mecklenburg-Vorpommern', 'Mecklenburg-Vorpommern'],
  'bund-thueringen.de': ['BUND Thüringen', 'Thüringen'],
  'bund-sachsen-anhalt.com': ['BUND Sachsen-Anhalt', 'Sachsen-Anhalt'],
  'bund-bremen.net': ['BUND Bremen', 'Bremen'],
  'bund-sachsen.de': ['BUND Sachsen', 'Sachsen'],
  'bund-hessen.de': ['BUND Hessen', 'Hessen'],
  'bund-sh.de': ['BUND Schleswig-Holstein', 'Schleswig-Holstein'],
  'bund-nrw.de': ['BUND NRW', 'Nordrhein-Westfalen'],
  'bund-bawue.de': ['BUND Baden-Württemberg', 'Baden-Württemberg'],
  'bund-rlp.de': ['BUND Rheinland-Pfalz', 'Rheinland-Pfalz'],
  'bund-hamburg.de': ['BUND Hamburg', 'Hamburg'],
  'bund-niedersachsen.de': ['BUND Niedersachsen', 'Niedersachsen'],
  'bund-brandenburg.de': ['BUND Brandenburg', 'Brandenburg'],
  'bund-berlin.de': ['BUND Berlin', 'Berlin'],
  'bund-saar.de': ['BUND Saarland', 'Saarland'],
  'bund-naturschutz.de': ['BUND Naturschutz in Bayern', 'Bayern'],
}

const MONTHS: Record<string, number> = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7,
  august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
  jan: 1, feb: 2, mär: 3, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  okt: 10, oct: 10, nov: 11, dez: 12, dec: 12, may: 5, march: 3, october: 10, december: 12,
}

function berlinOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}
/** Europe/Berlin wall-clock → UTC ISO (CET/CEST aware). */
function berlinIso(y: number, mo: number, d: number, h = 0, mi = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - berlinOffsetMin(guess) * 60000
  return new Date(guess - berlinOffsetMin(first) * 60000).toISOString()
}

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

// ── Geocoding ──────────────────────────────────────────────────────────────
// Nominatim (≥1.1 s apart, cached per query). Other sources share the IP, so
// on repeated 429s Nominatim is paused and Photon (komoot's free OSM
// geocoder, Germany bbox) is used instead. Total geocoding time is capped.
type LatLng = { lat: number; lng: number }
const geoCache = new Map<string, LatLng | null>()
let lastGeo = 0
let geoCalls = 0
let nominatimPausedUntil = 0
let geoDeadline = 0
const inDE = (lat: number, lng: number) => lat > 47.2 && lat < 55.1 && lng > 5.8 && lng < 15.1
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function geocode(q: string): Promise<LatLng | null> {
  q = q.replace(/\s+/g, ' ').trim()
  if (!q) return null
  if (geoCache.has(q)) return geoCache.get(q)!
  if (geoCalls >= MAX_GEOCODE || Date.now() > geoDeadline) return null
  for (let attempt = 0; attempt < 2 && Date.now() >= nominatimPausedUntil; attempt++) {
    const wait = lastGeo + 1100 + attempt * 3000 - Date.now()
    if (wait > 0) await sleep(wait)
    lastGeo = Date.now()
    geoCalls++
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'de' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 1) nominatimPausedUntil = Date.now() + 3 * 60000
        continue
      }
      if (!res.ok) break
      const d = await res.json()
      const lat = parseFloat(d?.[0]?.lat), lng = parseFloat(d?.[0]?.lon)
      const out = inDE(lat, lng) ? { lat, lng } : null
      geoCache.set(q, out)
      return out
    } catch { /* retry */ }
  }
  // Fallback: Photon
  const pw = lastGeo + 1100 - Date.now()
  if (pw > 0) await sleep(pw)
  lastGeo = Date.now()
  geoCalls++
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?limit=1&bbox=5.8,47.2,15.1,55.1&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null
    const f = (await res.json())?.features?.[0]
    const [lng, lat] = f?.geometry?.coordinates ?? []
    const out = f && (f.properties?.countrycode ?? 'DE') === 'DE' && inDE(lat, lng) ? { lat, lng } : null
    geoCache.set(q, out)
    return out
  } catch {
    return null
  }
}

/** Build geocoding queries from a free-text "Ort", most robust first. */
function placeQueries(ort: string, state?: string): string[] {
  const clean = ort
    .replace(/\b(Treffpunkt|Parkplatz|Treff|Ort)\s*:\s*/gi, '')
    .replace(/^online( und| \/| sowie)?\s*(im|in der|in)?\s*/i, '')
    .replace(/[()]/g, ',')
    .replace(/\s*,\s*(,\s*)*/g, ', ')
    .replace(/,\s*$/, '')
    .trim()
  const qs: string[] = []
  const plz = clean.match(/\b(\d{5})\s+([A-ZÄÖÜ][\wäöüß.\- ]*?)(?=,|$)/)
  if (plz) qs.push(`${plz[1]} ${plz[2].trim()}`)
  const parts = clean.split(',').map((s) => s.trim()).filter(Boolean)
  const sfx = state ? `, ${state}` : ''
  if (!plz) {
    if (parts.length > 1) qs.push(parts.slice(-2).join(', ') + sfx)
    qs.push(parts[parts.length - 1] + sfx)
    if (parts.length > 1) qs.push(parts[0] + sfx)
  }
  return [...new Set(qs.filter((q) => q.length > 2))]
}

interface Item { href: string; caption: string; title: string; ort: string; org: string; state?: string }

function parseItems(html: string, pool: Pool): Item[] {
  const out: Item[] = []
  for (const a of html.match(/<article class="m-content-dashboardbox">[\s\S]*?<\/article>/g) ?? []) {
    const href = a.match(/href="([^"]+)"/)?.[1]
    const caption = stripHtml(a.match(/caption">([\s\S]*?)<\/p>/)?.[1] ?? '')
    const title = stripHtml(a.match(/dashboardbox--title">([\s\S]*?)<\/h3>/)?.[1] ?? '')
    const ort = stripHtml(a.match(/<p class="rte-paragraph">\s*Ort:([\s\S]*?)<\/p>/)?.[1] ?? '')
    if (!href || !title || !caption) continue
    const url = new URL(href.replace(/&amp;/g, '&'), pool.base).toString()
    const dom = new URL(url).hostname.replace(/^www\./, '')
    const lv = LV[dom]
    out.push({ href: url, caption, title, ort, org: lv?.[0] ?? pool.org, state: lv?.[1] ?? pool.state })
  }
  return out
}

/** "08. - 10. Oktober 2026 um 8-20 Uhr | Ausstellung" → start/end + category */
function parseCaption(c: string): { start: string; end: string | null; cat: string; timed: boolean } | null {
  const [when, cat = ''] = c.split(/\s+\|\s+/)
  const umAt = when.search(/\s+um\s+/)
  const datePart = umAt >= 0 ? when.slice(0, umAt) : when
  const rawTime = umAt >= 0 ? when.slice(umAt).replace(/^\s+um\s+/, '') : ''
  // drop embedded dates like "16.10", "19.10.2026" so they aren't read as times
  const timePart = rawTime.replace(/\b\d{1,2}\.\d{1,2}(?!\d)\.?(?:\d{2,4})?(?!\s*(?:Uhr|[-–~]|bis))/g, ' ')
  const m1 = datePart.match(/^(\d{1,2})\.\s*(?:([A-Za-zäÄ]+)\s*(\d{4})?)?/)
  const m2 = datePart.match(/[-–]\s*(\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})/)
  if (!m1) return null
  const endMo = m2 ? MONTHS[m2[2].toLowerCase()] : undefined
  const mo = m1[2] ? MONTHS[m1[2].toLowerCase()] : endMo
  let y = m1[3] ? +m1[3] : m2 ? +m2[3] : NaN
  if (!mo || !Number.isFinite(y)) return null
  if (!m1[3] && m2 && endMo && mo > endMo) y -= 1 // "30. Dezember - 02. Januar 2027"
  const d = +m1[1]

  let h = 10, mi = 0, timed = false
  let eh: number | null = null, emi = 0
  const t = timePart.match(/(?:^|[^\d:])(\d{1,2})(?:[:.](\d{2}))?\s*(?=Uhr|[-–~]|bis|$|\s)(?:Uhr)?(?:\s*(?:[-–~]|bis)\s*(?:ca\.\s*)?(\d{1,2})(?:[:.](\d{2}))?)?/)
  if (t && +t[1] <= 23) {
    h = +t[1]; mi = t[2] ? +t[2] : 0; timed = true
    if (t[3] && +t[3] <= 23) { eh = +t[3]; emi = t[4] ? +t[4] : 0 }
  }
  const start = berlinIso(y, mo, d, h, mi)
  let end: string | null = null
  if (m2 && endMo) end = berlinIso(+m2[3], endMo, +m2[1], eh ?? 18, eh != null ? emi : 0)
  else if (eh != null && (eh > h || (eh === h && emi > mi))) end = berlinIso(y, mo, d, eh, emi)
  return { start, end, cat: cat.trim(), timed }
}

export const bundDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const items: Item[] = []
    let requests = 0
    for (const pool of POOLS) {
      const listUrl = pool.base + pool.listPath
      const first = await getText(listUrl)
      requests++
      if (!first) continue
      items.push(...parseItems(first, pool))
      const maxPage = Math.max(1, ...[...first.matchAll(/currentPage%5D=(\d+)/g)].map((m) => +m[1]))
      for (let p = 2; p <= Math.min(maxPage, 25); p++) {
        if (requests >= MAX_PAGE_REQUESTS) break
        const html = await getText(`${listUrl}event-page/1/?tx_bundpoolevent_display%5BeventItems%5D%5BcurrentPage%5D=${p}`)
        requests++
        if (!html) break
        const got = parseItems(html, pool)
        if (!got.length) break
        items.push(...got)
      }
      if (requests >= MAX_PAGE_REQUESTS) break
    }

    // Parse, filter and de-duplicate (national pool repeats LV events)
    const now = Date.now()
    const seen = new Set<string>()
    const parsed: Array<Item & { start: string; end: string | null; cat: string; timed: boolean }> = []
    for (const it of items) {
      const p = parseCaption(it.caption)
      if (!p || Date.parse(p.start) < now + 3600_000) continue
      const online = /\b(online|digital|zoom|webinar|videokonferenz|livestream)/i
      if (online.test(it.title) || online.test(it.ort)) {
        // hybrid with a real address is fine; pure online is not
        if (!/\b\d{5}\b/.test(it.ort)) continue
      }
      if (!it.ort || /bekannt gegeben|nach anmeldung|wird noch|tba\b/i.test(it.ort)) continue
      if (/abgesagt|f[äa]llt aus|entf[äa]llt/i.test(it.title)) continue
      const key = `${it.title.toLowerCase()}|${p.start.slice(0, 10)}`
      if (seen.has(key)) continue
      seen.add(key)
      parsed.push({ ...it, ...p })
    }
    parsed.sort((a, b) => a.start.localeCompare(b.start))

    geoDeadline = Date.now() + 6 * 60000
    const events: RawEvent[] = []
    for (const it of parsed) {
      if (events.length >= MAX_EVENTS) break
      let pos: { lat: number; lng: number } | null = null
      for (const q of placeQueries(it.ort, it.state)) {
        pos = await geocode(q)
        if (pos) break
      }
      if (!pos) continue
      const evId = it.href.match(/(?:\[|%5B)event(?:\]|%5D)=(\d+)/)?.[1]
      const slug = it.href.match(/event\/([^/?]+)\/?$/)?.[1]
        ?? (evId ? `${new URL(it.href).hostname.replace(/^www\.|\.\w+$/g, '')}-${evId}` : '')
      events.push({
        source: SRC,
        source_id: `bund-${slug ? slug.slice(0, 60) : ''}-${it.start.slice(0, 10)}`,
        source_url: it.href,
        title: it.title,
        description: [
          `${it.cat || 'Termin'} von ${it.org}.`,
          `Wann: ${it.caption.split(/\s+\|\s+/)[0]}.`,
          `Ort: ${it.ort}.`,
        ].join(' '),
        organizer: it.org,
        location_name: it.ort.slice(0, 200),
        lat: pos.lat,
        lng: pos.lng,
        starts_at: it.start,
        ends_at: it.end,
        cost: 'Siehe Termin',
      })
    }
    return events
  },
}
