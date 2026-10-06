/**
 * Shared helpers for the EU-wide network sources (balfolk-eu, cohousing-eu,
 * rescoop-eu, ripess-eu, zero-waste-eu, eupn): polite fetching, any-IANA-zone
 * wall-clock → UTC conversion, a country → time-zone table, English month
 * names and a cached, rate-limited Europe-wide Nominatim geocoder that also
 * reports the hit's country (so callers can pick the venue's real zone).
 */

export const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function getText(url: string, timeoutMs = 20000, init: RequestInit = {}): Promise<string | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json,text/calendar,*/*', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export async function getJson<T = any>(url: string, timeoutMs = 20000): Promise<T | null> {
  const t = await getText(url, timeoutMs)
  if (!t) return null
  try { return JSON.parse(t) as T } catch { return null }
}

// ── Time zones ───────────────────────────────────────────────────────────

/** ISO-3166 alpha-2 (lower case) → IANA zone, for European (and a few nearby) countries. */
export const CC_TZ: Record<string, string> = {
  al: 'Europe/Tirane', ad: 'Europe/Andorra', at: 'Europe/Vienna', ba: 'Europe/Sarajevo', be: 'Europe/Brussels',
  bg: 'Europe/Sofia', by: 'Europe/Minsk', ch: 'Europe/Zurich', cy: 'Asia/Nicosia', cz: 'Europe/Prague',
  de: 'Europe/Berlin', dk: 'Europe/Copenhagen', ee: 'Europe/Tallinn', es: 'Europe/Madrid', fi: 'Europe/Helsinki',
  fr: 'Europe/Paris', gb: 'Europe/London', uk: 'Europe/London', gr: 'Europe/Athens', hr: 'Europe/Zagreb',
  hu: 'Europe/Budapest', ie: 'Europe/Dublin', is: 'Atlantic/Reykjavik', it: 'Europe/Rome', li: 'Europe/Vaduz',
  lt: 'Europe/Vilnius', lu: 'Europe/Luxembourg', lv: 'Europe/Riga', mc: 'Europe/Monaco', md: 'Europe/Chisinau',
  me: 'Europe/Podgorica', mk: 'Europe/Skopje', mt: 'Europe/Malta', nl: 'Europe/Amsterdam', no: 'Europe/Oslo',
  pl: 'Europe/Warsaw', pt: 'Europe/Lisbon', ro: 'Europe/Bucharest', rs: 'Europe/Belgrade', se: 'Europe/Stockholm',
  si: 'Europe/Ljubljana', sk: 'Europe/Bratislava', sm: 'Europe/San_Marino', tr: 'Europe/Istanbul', ua: 'Europe/Kyiv',
  va: 'Europe/Vatican', xk: 'Europe/Belgrade', ge: 'Asia/Tbilisi', am: 'Asia/Yerevan', th: 'Asia/Bangkok',
}

/** English country name → alpha-2 (the names the feeds we read actually use). */
export const COUNTRY_CC: Record<string, string> = {
  albania: 'al', andorra: 'ad', austria: 'at', 'bosnia and herzegovina': 'ba', belgium: 'be', bulgaria: 'bg',
  belarus: 'by', switzerland: 'ch', cyprus: 'cy', czechia: 'cz', 'czech republic': 'cz', germany: 'de',
  denmark: 'dk', estonia: 'ee', spain: 'es', finland: 'fi', france: 'fr', 'united kingdom': 'gb', uk: 'gb',
  england: 'gb', scotland: 'gb', wales: 'gb', greece: 'gr', croatia: 'hr', hungary: 'hu', ireland: 'ie',
  iceland: 'is', italy: 'it', liechtenstein: 'li', lithuania: 'lt', luxembourg: 'lu', latvia: 'lv', malta: 'mt',
  moldova: 'md', montenegro: 'me', 'north macedonia': 'mk', netherlands: 'nl', 'the netherlands': 'nl',
  norway: 'no', poland: 'pl', portugal: 'pt', romania: 'ro', serbia: 'rs', sweden: 'se', slovenia: 'si',
  slovakia: 'sk', turkey: 'tr', 'türkiye': 'tr', ukraine: 'ua', kosovo: 'xk', georgia: 'ge', armenia: 'am',
  thailand: 'th',
}

export function tzForCountry(country: string | null | undefined): string | null {
  if (!country) return null
  const c = country.trim().toLowerCase()
  return CC_TZ[c] ?? CC_TZ[COUNTRY_CC[c] ?? ''] ?? null
}

/** Offset (minutes) of `tz` from UTC at instant ts. */
function offsetMin(tz: string, ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** Wall-clock time in IANA zone `tz` → ISO UTC (DST-aware). */
export function zonedIso(tz: string, y: number, mo: number, d: number, h = 10, mi = 0): string | null {
  if (!(y > 2000 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h >= 0 && h < 24 && mi >= 0 && mi < 60)) return null
  try {
    const guess = Date.UTC(y, mo - 1, d, h, mi)
    const first = guess - offsetMin(tz, guess) * 60000
    return new Date(guess - offsetMin(tz, first) * 60000).toISOString()
  } catch {
    return null
  }
}

export const EN_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
/** "Jun", "June", "sept." → 1..12 */
export function enMonth(s: string): number | undefined {
  return EN_MONTHS[s.toLowerCase().slice(0, 3)]
}

/** Online-only markers. */
export const ONLINE_RE = /\b(online|webinars?|virtual|zoom|livestream|en ligne|visio)\b/i

// ── Geocoding ────────────────────────────────────────────────────────────

export interface GeoHit { lat: number; lng: number; cc: string | null }

const geoCache = new Map<string, GeoHit | null>()
let lastGeo = 0
let pausedUntil = 0

/**
 * Nominatim lookup (≥1.1 s between calls, cached, backs off on 429/5xx).
 * `countryCodes` (e.g. 'de' or 'be,nl') narrows the search when known.
 */
export async function geocodeEu(query: string, countryCodes?: string): Promise<GeoHit | null> {
  const q = query.replace(/\s+/g, ' ').trim()
  if (!q) return null
  const key = `${countryCodes ?? ''}|${q}`
  if (geoCache.has(key)) return geoCache.get(key)!
  for (let attempt = 0; attempt < 4 && Date.now() >= pausedUntil; attempt++) {
    const wait = lastGeo + 1100 + attempt * 5000 - Date.now()
    if (wait > 0) await sleep(wait)
    lastGeo = Date.now()
    try {
      const cc = countryCodes ? `&countrycodes=${encodeURIComponent(countryCodes)}` : ''
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1${cc}&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 3) pausedUntil = Date.now() + 5 * 60000
        continue
      }
      if (!res.ok) break
      const d = await res.json()
      let out: GeoHit | null = null
      if (d[0]) {
        const lat = parseFloat(d[0].lat)
        const lng = parseFloat(d[0].lon)
        if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
          out = { lat, lng, cc: (d[0].address?.country_code ?? null) }
        }
      }
      geoCache.set(key, out)
      return out
    } catch { /* network error: retry */ }
  }
  return null
}

/** Try several queries in order (most specific first). */
export async function geocodeEuFirst(queries: string[], countryCodes?: string): Promise<GeoHit | null> {
  const seen = new Set<string>()
  for (const q of queries) {
    const k = q.replace(/\s+/g, ' ').trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    const r = await geocodeEu(k, countryCodes)
    if (r) return r
  }
  return null
}
