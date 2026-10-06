/**
 * Shared helpers for the Italian sources (permacultura-it, slowfood-it,
 * rive-it, gas-it): polite fetching, Europe/Rome → UTC conversion, Italian
 * month names and a cached, rate-limited Nominatim geocoder.
 */

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const GEO_UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'

export async function getText(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/json,*/*', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export const IT_MONTHS: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7,
  agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, sett: 9, ott: 10, nov: 11, dic: 12,
}

/** Offset (minutes) of Europe/Rome from UTC at instant ts. */
function romeOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** Europe/Rome wall-clock time → ISO UTC (handles CET/CEST). */
export function romeIso(y: number, mo: number, d: number, h = 0, mi = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - romeOffsetMin(guess) * 60000
  // Re-check with the offset at the computed instant (DST boundary days)
  return new Date(guess - romeOffsetMin(first) * 60000).toISOString()
}

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastGeo = 0
/** After repeated 429s, skip Nominatim for a while and go straight to Photon. */
let nominatimPausedUntil = 0

/** Nominatim lookup restricted to Italy; ≥1.1 s between calls, cached per query. */
export async function geocodeIt(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.replace(/\s+/g, ' ').trim()
  if (!q) return null
  if (geoCache.has(q)) return geoCache.get(q)!
  // Up to 3 attempts: a 429/5xx (shared IP, other sources geocoding too)
  // backs off and retries; only a definitive answer is cached.
  for (let attempt = 0; attempt < 3 && Date.now() >= nominatimPausedUntil; attempt++) {
    const wait = lastGeo + 1100 + attempt * 4000 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': GEO_UA, 'Accept-Language': 'it' }, signal: AbortSignal.timeout(15000) },
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
        // Italy bounding box sanity check
        if (lat > 35 && lat < 47.2 && lng > 6.5 && lng < 18.6) out = { lat, lng }
      }
      geoCache.set(q, out)
      return out
    } catch { /* network error: retry */ }
  }
  // Nominatim kept refusing (429 — shared IP): fall back to Photon (komoot's
  // free OSM geocoder), restricted to Italy's bounding box.
  const pw = lastGeo + 1100 - Date.now()
  if (pw > 0) await new Promise((r) => setTimeout(r, pw))
  lastGeo = Date.now()
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?limit=1&bbox=6.6,35.4,18.6,47.1&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': GEO_UA }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      const f = d?.features?.[0]
      let out: { lat: number; lng: number } | null = null
      if (f?.geometry?.coordinates && (f.properties?.countrycode ?? 'IT') === 'IT') {
        const [lng, lat] = f.geometry.coordinates
        if (lat > 35 && lat < 47.2 && lng > 6.5 && lng < 18.6) out = { lat, lng }
      }
      geoCache.set(q, out)
      return out
    }
  } catch { /* give up */ }
  return null
}

/** Try several queries in order (most specific first). */
export async function geocodeFirst(queries: string[]): Promise<{ lat: number; lng: number } | null> {
  for (const q of queries) {
    const r = await geocodeIt(q)
    if (r) return r
  }
  return null
}
