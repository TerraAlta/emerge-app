/**
 * Shared helpers for worldwide (global-network) sources:
 *  - getText(): polite fetch with the Emerge User-Agent and a timeout
 *  - zonedIso(): local wall-clock time in an IANA zone → UTC ISO string
 *  - tzFor(): best IANA zone for a country code (+ state / coordinates for
 *    multi-zone countries)
 *  - geocodeWorld(): Nominatim (worldwide), ≥1.1 s between calls, cached,
 *    backs off on 429, Photon fallback. Returns country code + state too so
 *    the caller can pick the venue's real time zone.
 */

export const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function getText(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/json,*/*', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

// ── Time zones ─────────────────────────────────────────────────────────────

function offsetMs(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** Wall-clock time (y, month 1-12, d, h, mi) in IANA zone `tz` → UTC ISO. Null on bad input. */
export function zonedIso(y: number, mo: number, d: number, h: number, mi: number, tz: string): string | null {
  if (![y, mo, d, h, mi].every(Number.isFinite) || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  const chk = new Date(wall)
  if (chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null // e.g. 31 Nov
  try {
    let t = wall - offsetMs(tz, wall)
    t = wall - offsetMs(tz, t) // second pass settles DST edges
    return new Date(t).toISOString()
  } catch {
    return null
  }
}

const COUNTRY_TZ: Record<string, string> = {
  gb: 'Europe/London', ie: 'Europe/Dublin', pt: 'Europe/Lisbon', es: 'Europe/Madrid', fr: 'Europe/Paris',
  be: 'Europe/Brussels', nl: 'Europe/Amsterdam', lu: 'Europe/Luxembourg', de: 'Europe/Berlin', ch: 'Europe/Zurich',
  li: 'Europe/Vaduz', at: 'Europe/Vienna', it: 'Europe/Rome', mt: 'Europe/Malta', dk: 'Europe/Copenhagen',
  se: 'Europe/Stockholm', no: 'Europe/Oslo', fi: 'Europe/Helsinki', is: 'Atlantic/Reykjavik', ee: 'Europe/Tallinn',
  lv: 'Europe/Riga', lt: 'Europe/Vilnius', pl: 'Europe/Warsaw', cz: 'Europe/Prague', sk: 'Europe/Bratislava',
  hu: 'Europe/Budapest', si: 'Europe/Ljubljana', hr: 'Europe/Zagreb', ba: 'Europe/Sarajevo', rs: 'Europe/Belgrade',
  me: 'Europe/Podgorica', mk: 'Europe/Skopje', al: 'Europe/Tirane', gr: 'Europe/Athens', bg: 'Europe/Sofia',
  ro: 'Europe/Bucharest', md: 'Europe/Chisinau', ua: 'Europe/Kiev', by: 'Europe/Minsk', tr: 'Europe/Istanbul',
  cy: 'Asia/Nicosia', il: 'Asia/Jerusalem', ps: 'Asia/Hebron', jo: 'Asia/Amman', lb: 'Asia/Beirut',
  ge: 'Asia/Tbilisi', am: 'Asia/Yerevan', ae: 'Asia/Dubai', in: 'Asia/Kolkata', np: 'Asia/Kathmandu',
  lk: 'Asia/Colombo', bd: 'Asia/Dhaka', bt: 'Asia/Thimphu', pk: 'Asia/Karachi', th: 'Asia/Bangkok',
  vn: 'Asia/Ho_Chi_Minh', kh: 'Asia/Phnom_Penh', la: 'Asia/Vientiane', mm: 'Asia/Yangon', my: 'Asia/Kuala_Lumpur',
  sg: 'Asia/Singapore', ph: 'Asia/Manila', cn: 'Asia/Shanghai', tw: 'Asia/Taipei', hk: 'Asia/Hong_Kong',
  jp: 'Asia/Tokyo', kr: 'Asia/Seoul', nz: 'Pacific/Auckland', za: 'Africa/Johannesburg', ke: 'Africa/Nairobi',
  ug: 'Africa/Kampala', tz: 'Africa/Dar_es_Salaam', rw: 'Africa/Kigali', et: 'Africa/Addis_Ababa', gh: 'Africa/Accra',
  ng: 'Africa/Lagos', sn: 'Africa/Dakar', ma: 'Africa/Casablanca', tn: 'Africa/Tunis', eg: 'Africa/Cairo',
  zw: 'Africa/Harare', zm: 'Africa/Lusaka', mw: 'Africa/Blantyre', mz: 'Africa/Maputo', na: 'Africa/Windhoek',
  bw: 'Africa/Gaborone', cm: 'Africa/Douala', cg: 'Africa/Brazzaville', bf: 'Africa/Ouagadougou', ml: 'Africa/Bamako',
  ci: 'Africa/Abidjan', bj: 'Africa/Porto-Novo', tg: 'Africa/Lome', co: 'America/Bogota', pe: 'America/Lima',
  ec: 'America/Guayaquil', cl: 'America/Santiago', ar: 'America/Argentina/Buenos_Aires', uy: 'America/Montevideo',
  py: 'America/Asuncion', bo: 'America/La_Paz', ve: 'America/Caracas', cr: 'America/Costa_Rica', pa: 'America/Panama',
  gt: 'America/Guatemala', ni: 'America/Managua', hn: 'America/Tegucigalpa', sv: 'America/El_Salvador',
  bz: 'America/Belize', cu: 'America/Havana', do: 'America/Santo_Domingo', pr: 'America/Puerto_Rico',
  jm: 'America/Jamaica', ht: 'America/Port-au-Prince', tt: 'America/Port_of_Spain',
}

const US_STATE_TZ: Record<string, string> = {
  alabama: 'America/Chicago', alaska: 'America/Anchorage', arizona: 'America/Phoenix', arkansas: 'America/Chicago',
  california: 'America/Los_Angeles', colorado: 'America/Denver', connecticut: 'America/New_York', delaware: 'America/New_York',
  'district of columbia': 'America/New_York', florida: 'America/New_York', georgia: 'America/New_York', hawaii: 'Pacific/Honolulu',
  idaho: 'America/Boise', illinois: 'America/Chicago', indiana: 'America/Indiana/Indianapolis', iowa: 'America/Chicago',
  kansas: 'America/Chicago', kentucky: 'America/New_York', louisiana: 'America/Chicago', maine: 'America/New_York',
  maryland: 'America/New_York', massachusetts: 'America/New_York', michigan: 'America/Detroit', minnesota: 'America/Chicago',
  mississippi: 'America/Chicago', missouri: 'America/Chicago', montana: 'America/Denver', nebraska: 'America/Chicago',
  nevada: 'America/Los_Angeles', 'new hampshire': 'America/New_York', 'new jersey': 'America/New_York', 'new mexico': 'America/Denver',
  'new york': 'America/New_York', 'north carolina': 'America/New_York', 'north dakota': 'America/Chicago', ohio: 'America/New_York',
  oklahoma: 'America/Chicago', oregon: 'America/Los_Angeles', pennsylvania: 'America/New_York', 'rhode island': 'America/New_York',
  'south carolina': 'America/New_York', 'south dakota': 'America/Chicago', tennessee: 'America/Chicago', texas: 'America/Chicago',
  utah: 'America/Denver', vermont: 'America/New_York', virginia: 'America/New_York', washington: 'America/Los_Angeles',
  'west virginia': 'America/New_York', wisconsin: 'America/Chicago', wyoming: 'America/Denver',
}

const CA_PROV_TZ: Record<string, string> = {
  'british columbia': 'America/Vancouver', alberta: 'America/Edmonton', saskatchewan: 'America/Regina',
  manitoba: 'America/Winnipeg', ontario: 'America/Toronto', quebec: 'America/Toronto', 'québec': 'America/Toronto',
  'new brunswick': 'America/Halifax', 'nova scotia': 'America/Halifax', 'prince edward island': 'America/Halifax',
  'newfoundland and labrador': 'America/St_Johns', yukon: 'America/Whitehorse', 'northwest territories': 'America/Yellowknife',
  nunavut: 'America/Iqaluit',
}

const AU_STATE_TZ: Record<string, string> = {
  'new south wales': 'Australia/Sydney', 'australian capital territory': 'Australia/Sydney', victoria: 'Australia/Melbourne',
  tasmania: 'Australia/Hobart', queensland: 'Australia/Brisbane', 'south australia': 'Australia/Adelaide',
  'northern territory': 'Australia/Darwin', 'western australia': 'Australia/Perth',
  nsw: 'Australia/Sydney', act: 'Australia/Sydney', vic: 'Australia/Melbourne', tas: 'Australia/Hobart',
  qld: 'Australia/Brisbane', sa: 'Australia/Adelaide', nt: 'Australia/Darwin', wa: 'Australia/Perth',
}

/**
 * Best IANA zone for a venue. `cc` = ISO 3166-1 alpha-2 (any case), `state` =
 * first-level region name if known. Falls back to a whole-hour Etc/GMT zone
 * derived from longitude (never wrong by more than ~1 h) when nothing fits.
 */
export function tzFor(cc: string | undefined, lat: number, lng: number, state?: string): string {
  const c = (cc ?? '').toLowerCase()
  const s = (state ?? '').toLowerCase().trim()
  if (c === 'us') {
    if (s === 'texas' && lng < -104.9) return 'America/Denver'
    if (s === 'florida' && lng < -85) return 'America/Chicago'
    if (s === 'tennessee' && lng > -85.3) return 'America/New_York'
    if (s === 'kentucky' && lng < -86.4) return 'America/Chicago'
    if (US_STATE_TZ[s]) return US_STATE_TZ[s]
    if (lng < -154) return 'Pacific/Honolulu'
    if (lat > 51 && lng < -130) return 'America/Anchorage'
    if (lng < -114.5) return 'America/Los_Angeles'
    if (lng < -102) return 'America/Denver'
    if (lng < -85.5) return 'America/Chicago'
    return 'America/New_York'
  }
  if (c === 'ca') {
    if (CA_PROV_TZ[s]) return CA_PROV_TZ[s]
    if (lng < -120) return 'America/Vancouver'
    if (lng < -110) return 'America/Edmonton'
    if (lng < -90) return 'America/Winnipeg'
    if (lng < -64) return 'America/Toronto'
    return 'America/Halifax'
  }
  if (c === 'au') {
    if (AU_STATE_TZ[s]) return AU_STATE_TZ[s]
    if (lng < 129) return 'Australia/Perth'
    return lat < -37 ? 'Australia/Melbourne' : 'Australia/Sydney'
  }
  if (c === 'br') return lng < -60 ? 'America/Manaus' : lng < -52 && lat > -10 ? 'America/Belem' : 'America/Sao_Paulo'
  if (c === 'mx') return lng < -114 ? 'America/Tijuana' : lng < -106 && lat > 22 ? 'America/Hermosillo' : 'America/Mexico_City'
  if (c === 'id') return lng < 114.6 ? 'Asia/Jakarta' : lng < 125 ? 'Asia/Makassar' : 'Asia/Jayapura'
  if (c === 'cd') return lng < 20 ? 'Africa/Kinshasa' : 'Africa/Lubumbashi'
  if (c === 'ru') {
    if (lng < 40) return 'Europe/Moscow'
    if (lng < 70) return 'Asia/Yekaterinburg'
    if (lng < 90) return 'Asia/Novosibirsk'
    return 'Asia/Irkutsk'
  }
  if (c === 'es' && lng < -12) return 'Atlantic/Canary'
  if (c === 'pt' && lng < -20) return 'Atlantic/Azores'
  if (c === 'ec' && lng < -85) return 'Pacific/Galapagos'
  if (COUNTRY_TZ[c]) return COUNTRY_TZ[c]
  const off = Math.round(lng / 15)
  return off === 0 ? 'Etc/GMT' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`
}

// ── Geocoding ──────────────────────────────────────────────────────────────

export interface GeoHit { lat: number; lng: number; cc: string; state: string }

const geoCache = new Map<string, GeoHit | null>()
let lastGeo = 0
let pausedUntil = 0

/** Worldwide Nominatim lookup (optionally restricted to `countrycodes`), cached, ≥1.1 s apart, 429 back-off, Photon fallback. */
export async function geocodeWorld(query: string, countrycodes?: string): Promise<GeoHit | null> {
  const q = query.replace(/\s+/g, ' ').trim()
  if (!q) return null
  const key = `${countrycodes ?? ''}|${q}`
  if (geoCache.has(key)) return geoCache.get(key)!
  for (let attempt = 0; attempt < 3 && Date.now() >= pausedUntil; attempt++) {
    const wait = lastGeo + 1100 + attempt * 5000 - Date.now()
    if (wait > 0) await sleep(wait)
    lastGeo = Date.now()
    try {
      const cc = countrycodes ? `&countrycodes=${countrycodes}` : ''
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1${cc}&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 2) pausedUntil = Date.now() + 5 * 60000
        continue
      }
      if (!res.ok) break
      const d = await res.json()
      let out: GeoHit | null = null
      if (d?.[0]) {
        const lat = parseFloat(d[0].lat)
        const lng = parseFloat(d[0].lon)
        if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
          out = { lat, lng, cc: String(d[0].address?.country_code ?? ''), state: String(d[0].address?.state ?? '') }
        }
      }
      geoCache.set(key, out)
      return out
    } catch { /* network error: retry */ }
  }
  // Nominatim kept refusing (shared IP): Photon (komoot's OSM geocoder).
  const pw = lastGeo + 1100 - Date.now()
  if (pw > 0) await sleep(pw)
  lastGeo = Date.now()
  try {
    const res = await fetch(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      const d = await res.json()
      const f = d?.features?.[0]
      let out: GeoHit | null = null
      if (f?.geometry?.coordinates) {
        const [lng, lat] = f.geometry.coordinates
        const pcc = String(f.properties?.countrycode ?? '').toLowerCase()
        if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
          && (!countrycodes || countrycodes.split(',').includes(pcc))) {
          out = { lat, lng, cc: pcc, state: String(f.properties?.state ?? '') }
        }
      }
      geoCache.set(key, out)
      return out
    }
  } catch { /* give up */ }
  return null
}

/** Try several queries in order (most specific first). */
export async function geocodeWorldFirst(queries: string[], countrycodes?: string): Promise<GeoHit | null> {
  const seen = new Set<string>()
  for (const q of queries) {
    const k = q.replace(/\s+/g, ' ').trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    const r = await geocodeWorld(k, countrycodes)
    if (r) return r
  }
  return null
}

export const ONLINE_RE = /\b(online|webinar|zoom|livestream|virtual event|virtually|en ligne|webinaire|ms teams|microsoft teams)\b/i

export const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
}

let nameToCc: Map<string, string> | null = null
/** English country name ("Germany", "United Kingdom", "Czechia"/"Czech Republic"…) → ISO alpha-2 lower-case. */
export function countryCodeFromName(name: string): string | undefined {
  if (!nameToCc) {
    nameToCc = new Map()
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'region' })
      for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b)
        const n = dn.of(code)
        if (n && n !== code) nameToCc.set(n.toLowerCase(), code.toLowerCase())
      }
    } catch { /* no ICU data: aliases only */ }
    const aliases: Record<string, string> = {
      'czech republic': 'cz', uk: 'gb', 'great britain': 'gb', england: 'gb', scotland: 'gb', wales: 'gb',
      'northern ireland': 'gb', usa: 'us', 'united states of america': 'us', holland: 'nl', 'the netherlands': 'nl',
      türkiye: 'tr', turkey: 'tr', 'south korea': 'kr', korea: 'kr', russia: 'ru', 'ivory coast': 'ci',
      'democratic republic of the congo': 'cd', 'dr congo': 'cd', drc: 'cd', 'republic of the congo': 'cg', congo: 'cg', brasil: 'br',
      'bosnia and herzegovina': 'ba', 'north macedonia': 'mk', 'macedonia': 'mk', 'swaziland': 'sz',
    }
    for (const [k, v] of Object.entries(aliases)) nameToCc.set(k, v)
  }
  return nameToCc.get(name.toLowerCase().trim())
}
