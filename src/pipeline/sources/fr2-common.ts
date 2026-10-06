/**
 * Shared helpers for the French sources rewritten in Oct 2026
 * (compaillons-fr, passerelleco-fr, repaircafe-fr, enercoop-fr):
 * polite fetching, Europe/Paris → UTC conversion, French month names and a
 * cached, rate-limited Nominatim geocoder restricted to metropolitan France.
 */

export const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'

export async function getText(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export const FR_MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
}

/** "Décembre" / "decembre" / "déc." → month number (1-12) or undefined. */
export function frMonth(s: string): number | undefined {
  const k = s.toLowerCase().replace(/\./g, '').trim()
  return FR_MONTHS[k] ?? FR_MONTHS[k.normalize('NFD').replace(/[̀-ͯ]/g, '')]
}

/** Offset (minutes) of Europe/Paris from UTC at instant ts. */
function parisOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** Europe/Paris wall-clock time → ISO UTC (handles CET/CEST). */
export function parisIso(y: number, mo: number, d: number, h = 0, mi = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - parisOffsetMin(guess) * 60000
  return new Date(guess - parisOffsetMin(first) * 60000).toISOString()
}

/** Metropolitan France + Corsica bounding box. */
export function inFrance(lat: number, lng: number): boolean {
  return lat > 41.2 && lat < 51.2 && lng > -5.3 && lng < 9.7
}

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastGeo = 0
let nominatimPausedUntil = 0

/** Nominatim lookup restricted to France; ≥1.1 s between calls, cached per query. */
export async function geocodeFr(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.replace(/\s+/g, ' ').trim()
  if (!q) return null
  if (geoCache.has(q)) return geoCache.get(q)!
  // Up to 3 attempts: 429/5xx (shared IP, other sources geocoding too) backs off.
  for (let attempt = 0; attempt < 3 && Date.now() >= nominatimPausedUntil; attempt++) {
    const wait = lastGeo + 1100 + attempt * 4000 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' }, signal: AbortSignal.timeout(15000) },
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
        if (inFrance(lat, lng)) out = { lat, lng }
      }
      geoCache.set(q, out)
      return out
    } catch { /* network error: retry */ }
  }
  // Nominatim kept refusing: fall back to Photon (komoot's OSM geocoder), France bbox.
  const pw = lastGeo + 1100 - Date.now()
  if (pw > 0) await new Promise((r) => setTimeout(r, pw))
  lastGeo = Date.now()
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?limit=1&bbox=-5.3,41.2,9.7,51.2&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      const f = d?.features?.[0]
      let out: { lat: number; lng: number } | null = null
      if (f?.geometry?.coordinates && (f.properties?.countrycode ?? 'FR') === 'FR') {
        const [lng, lat] = f.geometry.coordinates
        if (inFrance(lat, lng)) out = { lat, lng }
      }
      geoCache.set(q, out)
      return out
    }
  } catch { /* give up */ }
  return null
}

/** Try several queries in order (most specific first). */
export async function geocodeFrFirst(queries: string[]): Promise<{ lat: number; lng: number } | null> {
  for (const q of queries) {
    const r = await geocodeFr(q)
    if (r) return r
  }
  return null
}

export function isOnline(text: string): boolean {
  return /\b(en ligne|visio(conf[ée]rence)?|webinaire?s?|webinar|zoom|distanciel|t[ée]l[ée]r[ée]paration)\b/i.test(text)
}
