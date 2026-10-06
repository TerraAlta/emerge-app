/**
 * Shared helpers for worldwide sources (global networks):
 *  - polite fetch helpers with the Emerge User-Agent
 *  - wall-clock → UTC conversion for any IANA time zone
 *  - a coarse country/state → IANA time-zone resolver (multi-zone countries
 *    like the US, Canada, Australia, Brazil, Mexico and Russia are resolved
 *    from state name and/or longitude)
 *  - a worldwide Nominatim geocoder (≥1.1 s between calls, cached, backs off on 429)
 */

export const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function getText(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export async function getJson<T = any>(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T | null> {
  const t = await getText(url, { ...init, headers: { Accept: 'application/json', ...(init.headers ?? {}) } }, timeoutMs)
  if (!t) return null
  try { return JSON.parse(t) as T } catch { return null }
}

/* ------------------------------------------------------------------ */
/* Time zones                                                          */
/* ------------------------------------------------------------------ */

function tzOffsetMin(tz: string, ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** Wall-clock time in `tz` → UTC ISO string (null on invalid input). */
export function zonedIso(tz: string, y: number, mo: number, d: number, h = 10, mi = 0): string | null {
  if (!y || !mo || !d || mo > 12 || d > 31 || h > 23 || mi > 59) return null
  try {
    const guess = Date.UTC(y, mo - 1, d, h, mi)
    let ts = guess - tzOffsetMin(tz, guess) * 60000
    ts = guess - tzOffsetMin(tz, ts) * 60000 // second pass settles DST edges
    return Number.isNaN(ts) ? null : new Date(ts).toISOString()
  } catch {
    return null
  }
}

/** Single-zone countries (ISO 3166-1 alpha-2 → IANA). */
const CC_TZ: Record<string, string> = {
  ie: 'Europe/Dublin', gb: 'Europe/London', im: 'Europe/Isle_of_Man', je: 'Europe/Jersey', gg: 'Europe/Guernsey',
  fr: 'Europe/Paris', be: 'Europe/Brussels', nl: 'Europe/Amsterdam', lu: 'Europe/Luxembourg', de: 'Europe/Berlin',
  at: 'Europe/Vienna', ch: 'Europe/Zurich', li: 'Europe/Vaduz', it: 'Europe/Rome', sm: 'Europe/San_Marino',
  va: 'Europe/Vatican', mt: 'Europe/Malta', es: 'Europe/Madrid', pt: 'Europe/Lisbon', ad: 'Europe/Andorra',
  mc: 'Europe/Monaco', dk: 'Europe/Copenhagen', no: 'Europe/Oslo', se: 'Europe/Stockholm', fi: 'Europe/Helsinki',
  is: 'Atlantic/Reykjavik', fo: 'Atlantic/Faroe', ee: 'Europe/Tallinn', lv: 'Europe/Riga', lt: 'Europe/Vilnius',
  pl: 'Europe/Warsaw', cz: 'Europe/Prague', sk: 'Europe/Bratislava', hu: 'Europe/Budapest', si: 'Europe/Ljubljana',
  hr: 'Europe/Zagreb', ba: 'Europe/Sarajevo', rs: 'Europe/Belgrade', me: 'Europe/Podgorica', mk: 'Europe/Skopje',
  al: 'Europe/Tirane', xk: 'Europe/Belgrade', gr: 'Europe/Athens', bg: 'Europe/Sofia', ro: 'Europe/Bucharest',
  md: 'Europe/Chisinau', ua: 'Europe/Kyiv', by: 'Europe/Minsk', cy: 'Asia/Nicosia', tr: 'Europe/Istanbul',
  ge: 'Asia/Tbilisi', am: 'Asia/Yerevan', az: 'Asia/Baku', il: 'Asia/Jerusalem', ps: 'Asia/Hebron',
  lb: 'Asia/Beirut', jo: 'Asia/Amman', eg: 'Africa/Cairo', ma: 'Africa/Casablanca', tn: 'Africa/Tunis',
  dz: 'Africa/Algiers', za: 'Africa/Johannesburg', ke: 'Africa/Nairobi', tz: 'Africa/Dar_es_Salaam',
  ug: 'Africa/Kampala', rw: 'Africa/Kigali', et: 'Africa/Addis_Ababa', gh: 'Africa/Accra', ng: 'Africa/Lagos',
  sn: 'Africa/Dakar', zw: 'Africa/Harare', zm: 'Africa/Lusaka', mw: 'Africa/Blantyre', mz: 'Africa/Maputo',
  na: 'Africa/Windhoek', bw: 'Africa/Gaborone', in: 'Asia/Kolkata', np: 'Asia/Kathmandu', lk: 'Asia/Colombo',
  bd: 'Asia/Dhaka', pk: 'Asia/Karachi', th: 'Asia/Bangkok', vn: 'Asia/Ho_Chi_Minh', kh: 'Asia/Phnom_Penh',
  la: 'Asia/Vientiane', mm: 'Asia/Yangon', my: 'Asia/Kuala_Lumpur', sg: 'Asia/Singapore', ph: 'Asia/Manila',
  cn: 'Asia/Shanghai', hk: 'Asia/Hong_Kong', tw: 'Asia/Taipei', jp: 'Asia/Tokyo', kr: 'Asia/Seoul',
  ae: 'Asia/Dubai', qa: 'Asia/Qatar', sa: 'Asia/Riyadh', nz: 'Pacific/Auckland', fj: 'Pacific/Fiji',
  ar: 'America/Argentina/Buenos_Aires', cl: 'America/Santiago', uy: 'America/Montevideo', py: 'America/Asuncion',
  bo: 'America/La_Paz', pe: 'America/Lima', co: 'America/Bogota', ve: 'America/Caracas', ec: 'America/Guayaquil',
  cr: 'America/Costa_Rica', pa: 'America/Panama', ni: 'America/Managua', hn: 'America/Tegucigalpa',
  sv: 'America/El_Salvador', gt: 'America/Guatemala', bz: 'America/Belize', cu: 'America/Havana',
  do: 'America/Santo_Domingo', pr: 'America/Puerto_Rico', jm: 'America/Jamaica', bs: 'America/Nassau',
  tt: 'America/Port_of_Spain', bb: 'America/Barbados',
}

/** Country names as used by sites (e.g. The Session) → ISO alpha-2. */
const NAME_CC: Record<string, string> = {
  ireland: 'ie', 'republic of ireland': 'ie', 'northern ireland': 'gb', england: 'gb', scotland: 'gb', wales: 'gb',
  'united kingdom': 'gb', uk: 'gb', 'isle of man': 'im', jersey: 'je', guernsey: 'gg', usa: 'us',
  'united states': 'us', 'united states of america': 'us', canada: 'ca', australia: 'au', 'new zealand': 'nz',
  france: 'fr', belgium: 'be', netherlands: 'nl', 'the netherlands': 'nl', holland: 'nl', luxembourg: 'lu',
  germany: 'de', austria: 'at', switzerland: 'ch', italy: 'it', malta: 'mt', spain: 'es', portugal: 'pt',
  denmark: 'dk', norway: 'no', sweden: 'se', finland: 'fi', iceland: 'is', estonia: 'ee', latvia: 'lv',
  lithuania: 'lt', poland: 'pl', 'czech republic': 'cz', czechia: 'cz', slovakia: 'sk', hungary: 'hu',
  slovenia: 'si', croatia: 'hr', serbia: 'rs', greece: 'gr', bulgaria: 'bg', romania: 'ro', ukraine: 'ua',
  cyprus: 'cy', turkey: 'tr', israel: 'il', japan: 'jp', china: 'cn', 'hong kong': 'hk', taiwan: 'tw',
  'south korea': 'kr', korea: 'kr', singapore: 'sg', thailand: 'th', india: 'in', 'south africa': 'za',
  kenya: 'ke', argentina: 'ar', chile: 'cl', uruguay: 'uy', brazil: 'br', mexico: 'mx', colombia: 'co',
  peru: 'pe', 'costa rica': 'cr', philippines: 'ph', 'united arab emirates': 'ae', russia: 'ru',
}

export function countryCode(nameOrCode: string | null | undefined): string | null {
  const s = (nameOrCode ?? '').trim().toLowerCase()
  if (!s) return null
  if (s.length === 2) return s
  return NAME_CC[s] ?? null
}

const US_STATE_TZ: Record<string, string> = {
  connecticut: 'America/New_York', delaware: 'America/New_York', 'district of columbia': 'America/New_York',
  georgia: 'America/New_York', maine: 'America/New_York', maryland: 'America/New_York',
  massachusetts: 'America/New_York', 'new hampshire': 'America/New_York', 'new jersey': 'America/New_York',
  'new york': 'America/New_York', 'north carolina': 'America/New_York', ohio: 'America/New_York',
  pennsylvania: 'America/New_York', 'rhode island': 'America/New_York', 'south carolina': 'America/New_York',
  vermont: 'America/New_York', virginia: 'America/New_York', 'west virginia': 'America/New_York',
  michigan: 'America/Detroit', alabama: 'America/Chicago', arkansas: 'America/Chicago', illinois: 'America/Chicago',
  iowa: 'America/Chicago', louisiana: 'America/Chicago', minnesota: 'America/Chicago',
  mississippi: 'America/Chicago', missouri: 'America/Chicago', oklahoma: 'America/Chicago',
  wisconsin: 'America/Chicago', colorado: 'America/Denver', montana: 'America/Denver',
  'new mexico': 'America/Denver', utah: 'America/Denver', wyoming: 'America/Denver', arizona: 'America/Phoenix',
  california: 'America/Los_Angeles', nevada: 'America/Los_Angeles', washington: 'America/Los_Angeles',
  alaska: 'America/Anchorage', hawaii: 'Pacific/Honolulu',
}

function usTz(state: string, lat: number, lng: number): string {
  const s = state.toLowerCase().replace(/^state of /, '')
  // states split between zones
  switch (s) {
    case 'florida': return lng < -85.0 ? 'America/Chicago' : 'America/New_York'
    case 'tennessee': return lng < -85.6 ? 'America/Chicago' : 'America/New_York'
    case 'kentucky': return lng < -86.0 ? 'America/Chicago' : 'America/New_York'
    case 'indiana': return lng < -86.9 && (lat > 41 || lat < 38.5) ? 'America/Chicago' : 'America/Indiana/Indianapolis'
    case 'texas': return lng < -104.9 ? 'America/Denver' : 'America/Chicago'
    case 'kansas': case 'nebraska': return lng < -101.5 ? 'America/Denver' : 'America/Chicago'
    case 'south dakota': return lng < -100.5 ? 'America/Denver' : 'America/Chicago'
    case 'north dakota': return lng < -101.0 && lat < 47.5 ? 'America/Denver' : 'America/Chicago'
    case 'oregon': return lng > -117.2 && lat < 44.5 ? 'America/Boise' : 'America/Los_Angeles'
    case 'idaho': return lat > 45.5 ? 'America/Los_Angeles' : 'America/Boise'
  }
  if (US_STATE_TZ[s]) return US_STATE_TZ[s]
  // unknown state: longitude bands
  if (lat < 23 && lng < -154) return 'Pacific/Honolulu'
  if (lat > 51 && lng < -130) return 'America/Anchorage'
  if (lng > -85.5) return 'America/New_York'
  if (lng > -101) return 'America/Chicago'
  if (lng > -114.5) return 'America/Denver'
  return 'America/Los_Angeles'
}

function caTz(prov: string, lng: number): string {
  const s = prov.toLowerCase()
  if (/british columbia/.test(s)) return 'America/Vancouver'
  if (/alberta/.test(s)) return 'America/Edmonton'
  if (/saskatchewan/.test(s)) return 'America/Regina'
  if (/manitoba/.test(s)) return 'America/Winnipeg'
  if (/ontario/.test(s)) return lng < -90 ? 'America/Winnipeg' : 'America/Toronto'
  if (/qu[eé]bec/.test(s)) return 'America/Toronto'
  if (/new brunswick|nova scotia|prince edward/.test(s)) return 'America/Halifax'
  if (/newfoundland|labrador/.test(s)) return 'America/St_Johns'
  if (/yukon/.test(s)) return 'America/Whitehorse'
  if (/northwest/.test(s)) return 'America/Yellowknife'
  if (/nunavut/.test(s)) return 'America/Iqaluit'
  if (lng > -59.5) return 'America/St_Johns'
  if (lng > -67) return 'America/Halifax'
  if (lng > -90) return 'America/Toronto'
  if (lng > -102) return 'America/Winnipeg'
  if (lng > -110) return 'America/Regina'
  if (lng > -120) return 'America/Edmonton'
  return 'America/Vancouver'
}

function auTz(state: string, lat: number, lng: number): string {
  const s = state.toLowerCase()
  if (/new south wales|capital territory|\bnsw\b|\bact\b/.test(s)) return 'Australia/Sydney'
  if (/victoria|\bvic\b/.test(s)) return 'Australia/Melbourne'
  if (/queensland|\bqld\b/.test(s)) return 'Australia/Brisbane'
  if (/south australia|\bsa\b/.test(s)) return 'Australia/Adelaide'
  if (/western australia|\bwa\b/.test(s)) return 'Australia/Perth'
  if (/tasmania|\btas\b/.test(s)) return 'Australia/Hobart'
  if (/northern territory|\bnt\b/.test(s)) return 'Australia/Darwin'
  if (lng < 129) return 'Australia/Perth'
  if (lng < 138 && lat > -26) return 'Australia/Darwin'
  if (lng < 141) return 'Australia/Adelaide'
  if (lat > -28.2) return 'Australia/Brisbane'
  if (lat < -39.5) return 'Australia/Hobart'
  return 'Australia/Sydney'
}

/**
 * Best-effort IANA zone for a place. `country` may be an ISO alpha-2 code or a
 * common English name; `state` is the region/state/province name when known.
 * Returns null when the zone can't be determined (caller should skip the event).
 */
export function tzFor(country: string | null | undefined, lat: number, lng: number, state = ''): string | null {
  const cc = countryCode(country)
  if (!cc) return null
  switch (cc) {
    case 'us': return usTz(state, lat, lng)
    case 'ca': return caTz(state, lng)
    case 'au': return auTz(state, lat, lng)
    case 'es': return lng < -12 && lat < 30 ? 'Atlantic/Canary' : 'Europe/Madrid'
    case 'pt': return lng < -24 ? 'Atlantic/Azores' : lng < -15 ? 'Atlantic/Madeira' : 'Europe/Lisbon'
    case 'br':
      if (lng > -38 && lat > -10) return 'America/Recife'
      if (lng < -60) return 'America/Manaus'
      return 'America/Sao_Paulo'
    case 'mx':
      if (lng < -114.7) return 'America/Tijuana'
      if (lng < -106) return 'America/Mazatlan'
      if (lng > -89.3 && lat > 17.8 && lat < 21.7) return 'America/Cancun'
      return 'America/Mexico_City'
    case 'ru':
      if (lng < 22) return 'Europe/Kaliningrad'
      if (lng < 50) return 'Europe/Moscow'
      if (lng < 66) return 'Asia/Yekaterinburg'
      if (lng < 88) return 'Asia/Novosibirsk'
      if (lng < 105) return 'Asia/Krasnoyarsk'
      if (lng < 120) return 'Asia/Irkutsk'
      if (lng < 135) return 'Asia/Yakutsk'
      return 'Asia/Vladivostok'
    case 'id':
      if (lng < 114.5) return 'Asia/Jakarta'
      if (lng < 125) return 'Asia/Makassar'
      return 'Asia/Jayapura'
    case 'ec': return lng < -85 ? 'Pacific/Galapagos' : 'America/Guayaquil'
    case 'nz': return 'Pacific/Auckland'
  }
  return CC_TZ[cc] ?? null
}

/* ------------------------------------------------------------------ */
/* Geocoding                                                           */
/* ------------------------------------------------------------------ */

export interface GeoHit { lat: number; lng: number; cc: string; state: string }

const geoCache = new Map<string, GeoHit | null>()
let lastGeo = 0
let pausedUntil = 0

/** Worldwide Nominatim lookup; ≥1.1 s between calls, cached, backs off on 429. */
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
        if (attempt === 2) pausedUntil = Date.now() + 3 * 60000
        continue
      }
      if (!res.ok) break
      const d = await res.json()
      let out: GeoHit | null = null
      if (d?.[0]) {
        const lat = parseFloat(d[0].lat)
        const lng = parseFloat(d[0].lon)
        const a = d[0].address ?? {}
        if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
          out = { lat, lng, cc: String(a.country_code ?? '').toLowerCase(), state: String(a.state ?? a.province ?? a.region ?? '') }
        }
      }
      geoCache.set(key, out)
      return out
    } catch { /* network error: retry */ }
  }
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

export const ONLINE_RE = /\b(online|webinar|webinare?|zoom|livestream|live stream|virtual|en ligne|digital event|ms teams|microsoft teams)\b/i
