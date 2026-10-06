/**
 * Shared helpers for the Swiss sources (biosuisse-ch, pusch-ch,
 * permaculture-ch, agroecology-works-ch, biovision-ch, glarisegg-ch,
 * transition-ch, regenerativ-ch): polite fetching, Europe/Zurich → UTC,
 * German/French/Italian month names, a Wix Events extractor and a cached,
 * rate-limited Nominatim geocoder restricted to Switzerland/Liechtenstein.
 */

export const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** GET as text; one retry after 2 s on a network error or 429/5xx. */
export async function getText(url: string, timeoutMs = 20000, accept = 'text/html,application/json,*/*'): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(2000)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: accept },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return await res.text()
      if (res.status !== 429 && res.status < 500) return null
    } catch { /* retry */ }
  }
  return null
}

const MONTHS: Record<string, number> = {
  // German
  januar: 1, jänner: 1, jan: 1, februar: 2, feb: 2, märz: 3, maerz: 3, mär: 3, mrz: 3, april: 4, apr: 4,
  mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12,
  // French
  janvier: 1, janv: 1, février: 2, fevrier: 2, févr: 2, fevr: 2, mars: 3, avril: 4, avr: 4, juin: 6,
  juillet: 7, juil: 7, août: 8, aout: 8, septembre: 9, octobre: 10, oct: 10, novembre: 11, décembre: 12, decembre: 12, déc: 12, dec: 12,
  // Italian
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8,
  settembre: 9, ottobre: 10, dicembre: 12,
}

/** Month name / abbreviation (DE/FR/IT, any case, optional trailing dot) → 1..12. */
export function monthNum(s: string): number | undefined {
  return MONTHS[s.toLowerCase().replace(/\.$/, '')]
}

/** Offset (minutes) of Europe/Zurich from UTC at instant ts. */
function zurichOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** Europe/Zurich wall-clock time → ISO UTC (CET/CEST aware); null if invalid. */
export function zurichIso(y: number, mo: number, d: number, h = 10, mi = 0): string | null {
  if (!(y > 2000 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h >= 0 && h < 24 && mi >= 0 && mi < 60)) return null
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  if (new Date(guess).getUTCDate() !== d) return null // e.g. 31 Nov
  const first = guess - zurichOffsetMin(guess) * 60000
  return new Date(guess - zurichOffsetMin(first) * 60000).toISOString()
}

/** Online-only markers (skip these events). */
export const ONLINE_RE = /\b(online|webinar|webinare?|webinaire|en ligne|zoom|ms teams|microsoft teams|visio(conf[ée]rence)?|livestream)\b/i

// ── Wix Events (server-rendered warmup data) ───────────────────────────────

/** Return the balanced JSON object starting at s[i] === '{' (string-aware). */
function objectAt(s: string, i: number): string | null {
  let depth = 0, inStr = false, esc = false
  for (let k = i; k < s.length; k++) {
    const c = s[k]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(i, k + 1)
    }
  }
  return null
}

/**
 * Wix sites with the Events app embed every listed event (id, title, slug,
 * scheduling.config.startDate/endDate in UTC, location incl. coordinates)
 * as JSON in the page HTML. Returns the unique event objects.
 */
export function extractWixEvents(html: string): any[] {
  const out = new Map<string, any>()
  const re = /\{"id":"[0-9a-f-]{36}","location":\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const raw = objectAt(html, m.index)
    if (!raw) continue
    try {
      const o = JSON.parse(raw)
      if (o?.id && o?.scheduling?.config && o?.title) out.set(o.id, o)
    } catch { /* skip */ }
  }
  return [...out.values()]
}

// ── Geocoding ────────────────────────────────────────────────────────────

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastGeo = 0
let nominatimPausedUntil = 0

function inCh(lat: number, lng: number): boolean {
  // Switzerland + Liechtenstein bounding box
  return lat > 45.8 && lat < 47.9 && lng > 5.9 && lng < 10.6
}

/** Nominatim lookup restricted to CH/LI; ≥1.1 s between calls, cached, backs off on 429 (then Photon). */
export async function geocodeCh(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.replace(/\s+/g, ' ').trim()
  if (!q) return null
  if (geoCache.has(q)) return geoCache.get(q)!
  for (let attempt = 0; attempt < 3 && Date.now() >= nominatimPausedUntil; attempt++) {
    const wait = lastGeo + 1100 + attempt * 5000 - Date.now()
    if (wait > 0) await sleep(wait)
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ch,li&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'de' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 2) nominatimPausedUntil = Date.now() + 5 * 60000
        continue
      }
      if (!res.ok) break
      const d = await res.json()
      let out: { lat: number; lng: number } | null = null
      if (d[0]) {
        const lat = parseFloat(d[0].lat)
        const lng = parseFloat(d[0].lon)
        if (inCh(lat, lng)) out = { lat, lng }
      }
      geoCache.set(q, out)
      return out
    } catch { /* network error: retry */ }
  }
  // Nominatim kept refusing (shared IP): Photon (komoot's OSM geocoder) within CH.
  const pw = lastGeo + 1100 - Date.now()
  if (pw > 0) await sleep(pw)
  lastGeo = Date.now()
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?limit=1&bbox=5.9,45.8,10.6,47.9&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      const f = d?.features?.[0]
      let out: { lat: number; lng: number } | null = null
      if (f?.geometry?.coordinates) {
        const [lng, lat] = f.geometry.coordinates
        if (inCh(lat, lng)) out = { lat, lng }
      }
      geoCache.set(q, out)
      return out
    }
  } catch { /* give up */ }
  return null
}

/** Try several queries in order (most specific first). */
export async function geocodeChFirst(queries: string[]): Promise<{ lat: number; lng: number } | null> {
  const seen = new Set<string>()
  for (const q of queries) {
    const k = q.replace(/\s+/g, ' ').trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    const r = await geocodeCh(k)
    if (r) return r
  }
  return null
}
