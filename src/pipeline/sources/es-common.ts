/**
 * Shared helpers for the Spanish sources (agri-regen-es, reas-es, huertos-es):
 * polite fetching, Europe/Madrid (and Atlantic/Canary) → UTC conversion,
 * Spanish / Catalan / Galician / Basque month names, a date-range parser for
 * free-text Spanish dates, and a cached, rate-limited Nominatim geocoder
 * restricted to Spain (with Photon fallback on 429).
 */

export const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'

export async function getText(url: string, timeoutMs = 20000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*' },
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

/** Lower-case and strip accents (març → marc, xuño → xuno). */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Month names (accent-folded) in Spanish, Catalan, Galician and Basque, plus abbreviations. */
export const ES_MONTHS: Record<string, number> = {
  // Spanish
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12,
  // Catalan
  gener: 1, febrer: 2, marc: 3, maig: 5, juny: 6, juliol: 7, agost: 8, setembre: 9, desembre: 12,
  gen: 1, des: 12, set: 9,
  // Galician
  xaneiro: 1, febreiro: 2, maio: 5, xuno: 6, xullo: 7, setembro: 9, outubro: 10, novembro: 11, decembro: 12,
  // Basque
  urtarrila: 1, otsaila: 2, martxoa: 3, apirila: 4, maiatza: 5, ekaina: 6, uztaila: 7, abuztua: 8,
  iraila: 9, urria: 10, azaroa: 11, abendua: 12,
}
const MONTH_ALT = Object.keys(ES_MONTHS).sort((a, b) => b.length - a.length).join('|')

/** Offset (minutes) of a time zone from UTC at instant ts. */
function tzOffsetMin(ts: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** Local wall-clock time in Spain → ISO UTC (CET/CEST; WET/WEST for the Canaries). */
export function spainIso(y: number, mo: number, d: number, h = 10, mi = 0, tz = 'Europe/Madrid'): string | null {
  if (!(y > 2000 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h >= 0 && h < 24 && mi >= 0 && mi < 60)) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1) return null // e.g. 31 June
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - tzOffsetMin(guess, tz) * 60000
  return new Date(guess - tzOffsetMin(first, tz) * 60000).toISOString()
}

/** Canary Islands use Atlantic/Canary (one hour behind the mainland). */
export function tzFor(lat: number, lng: number): string {
  return lat < 30 && lng < -12 ? 'Atlantic/Canary' : 'Europe/Madrid'
}

export interface Ymd { y: number; mo: number; d: number }

/**
 * Parse a Spanish/Catalan/Galician/Basque date or date range such as
 *   "17 y 18 de octubre 2026", "6 de octubre al 12 de noviembre 2026",
 *   "22 al 24 de octubre", "7 de noviembre 10:00 al 7 de noviembre 17:00",
 *   "del 3 al 5 de juliol de 2026".
 * Missing months/years are taken from the next item that has them; a still
 * missing year is inferred relative to `ref` (the date may lie at most
 * `pastDays` before ref, otherwise it rolls into the next year).
 * Returns null when no day+month can be found.
 */
export function parseEsRange(text: string, ref: Date = new Date(), pastDays = 60): { start: Ymd; end?: Ymd } | null {
  const s = fold(text).replace(/\b(?:de|del)\b\s*|\bd['’]\s*/g, ' ').replace(/\s+/g, ' ')
  const re = new RegExp(`(?<![\\d:.])(\\d{1,2})(?!\\d)(?:º|ª|r\\b|er\\b)?(?![\\d:.,]\\d|\\s*h\\b|h\\b)(?:\\s*(?:,\\s*)?(${MONTH_ALT})\\b\\.?)?(?:\\s*,?\\s*(\\d{4}))?`, 'g')
  const items: { d: number; mo?: number; y?: number }[] = []
  for (const m of s.matchAll(re)) {
    const d = +m[1]
    if (d < 1 || d > 31) continue
    items.push({ d, mo: m[2] ? ES_MONTHS[m[2]] : undefined, y: m[3] ? +m[3] : undefined })
  }
  // Fill months / years backwards from the next item that has them
  for (let i = items.length - 2; i >= 0; i--) {
    if (!items[i].mo && items[i + 1].mo) {
      items[i].mo = items[i + 1].mo
      if (!items[i].y) items[i].y = items[i + 1].y
    } else if (items[i].mo && !items[i].y && items[i + 1].y) {
      items[i].y = items[i + 1].y
    }
  }
  const dated = items.filter((x) => x.mo)
  if (!dated.length) return null
  const resolveYear = (x: { d: number; mo?: number; y?: number }): Ymd => {
    if (x.y) return { y: x.y, mo: x.mo!, d: x.d }
    let y = ref.getUTCFullYear()
    if (Date.UTC(y, x.mo! - 1, x.d) < ref.getTime() - pastDays * 86400000) y++
    return { y, mo: x.mo!, d: x.d }
  }
  const start = resolveYear(dated[0])
  let end: Ymd | undefined
  if (dated.length > 1) {
    const last = dated[dated.length - 1]
    end = resolveYear(last)
    // A range crossing New Year without explicit years ("28 dic al 3 ene")
    if (!last.y && Date.UTC(end.y, end.mo - 1, end.d) < Date.UTC(start.y, start.mo - 1, start.d)) end.y++
    if (Date.UTC(end.y, end.mo - 1, end.d) < Date.UTC(start.y, start.mo - 1, start.d)) end = undefined
    else if (end.y === start.y && end.mo === start.mo && end.d === start.d) end = undefined
  }
  return { start, end }
}

/** First clock time in a string: "10:00", "10.30 h", "18 h", "11:00h", "a las 20h". */
export function parseTime(text: string): { h: number; mi: number } | null {
  // "de 10 a 15h", "de 10 a 13:30 h" → the first hour
  const r = text.match(/\bde\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:h\s*)?a\s+(?:las\s+)?\d{1,2}(?:[:.]\d{2})?\s*h/i)
  if (r && +r[1] <= 23) return { h: +r[1], mi: r[2] ? +r[2] : 0 }
  const m = text.match(/(?<![\d.:])(\d{1,2})(?:[:.](\d{2}))\s*(?:h\b|hrs?\b)?|(?<![\d.:])(\d{1,2})\s*h(?:rs?)?\b/i)
  if (!m) return null
  const h = +(m[1] ?? m[3])
  const mi = m[2] ? +m[2] : 0
  if (h > 23 || mi > 59) return null
  return { h, mi }
}

/** All clock times in a string, in order. */
export function parseTimes(text: string): { h: number; mi: number }[] {
  const out: { h: number; mi: number }[] = []
  for (const m of text.matchAll(/(?<![\d.:])(\d{1,2})(?:[:.](\d{2}))\s*(?:h\b)?|(?<![\d.:])(\d{1,2})\s*h\b/gi)) {
    const h = +(m[1] ?? m[3]); const mi = m[2] ? +m[2] : 0
    if (h <= 23 && mi <= 59) out.push({ h, mi })
  }
  return out
}

export const ONLINE_RE = /\b(online|on-line|en l[ií]nea|webinar(io)?s?|zoom|google meets?|jitsi|telem[aá]tic[oa]|virtual|streaming|en directo por)\b/i

/** Spanish provinces / autonomous communities (accent-folded), to tell Spain from abroad. */
const ES_REGIONS = new Set([
  'espana', 'spain', 'estado espanol',
  'alava', 'araba', 'albacete', 'alicante', 'alacant', 'almeria', 'asturias', 'avila', 'badajoz', 'baleares', 'illes balears',
  'islas baleares', 'mallorca', 'menorca', 'ibiza', 'eivissa', 'formentera', 'barcelona', 'burgos', 'caceres', 'cadiz', 'cantabria',
  'castellon', 'castello', 'ciudad real', 'cordoba', 'a coruna', 'la coruna', 'coruna', 'cuenca', 'girona', 'gerona', 'granada',
  'guadalajara', 'gipuzkoa', 'guipuzcoa', 'huelva', 'huesca', 'jaen', 'leon', 'lleida', 'lerida', 'lugo', 'madrid', 'malaga',
  'murcia', 'navarra', 'nafarroa', 'ourense', 'orense', 'palencia', 'las palmas', 'gran canaria', 'pontevedra', 'la rioja', 'rioja',
  'salamanca', 'santa cruz de tenerife', 'tenerife', 'la palma', 'lanzarote', 'fuerteventura', 'la gomera', 'el hierro', 'segovia',
  'sevilla', 'soria', 'tarragona', 'teruel', 'toledo', 'valencia', 'valencia', 'valladolid', 'bizkaia', 'vizcaya', 'zamora',
  'zaragoza', 'ceuta', 'melilla', 'andalucia', 'aragon', 'canarias', 'islas canarias', 'castilla y leon', 'castilla-la mancha',
  'castilla la mancha', 'cataluna', 'catalunya', 'comunidad valenciana', 'comunitat valenciana', 'pais valencia', 'extremadura',
  'galicia', 'euskadi', 'pais vasco', 'euskal herria', 'principado de asturias', 'region de murcia', 'comunidad de madrid',
])
export function isSpanishRegion(s: string): boolean {
  const f = fold(s).replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!f) return false
  if (ES_REGIONS.has(f)) return true
  // "Cádiz y Sevilla", "Álava / Araba"
  return f.split(/\s*(?:\by\b|\bi\b|\/|,|-)\s*/).some((p) => ES_REGIONS.has(p.trim()))
}

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastGeo = 0
let nominatimPausedUntil = 0
const inSpain = (lat: number, lng: number) =>
  (lat > 35.8 && lat < 43.9 && lng > -9.5 && lng < 4.5) || (lat > 27.5 && lat < 29.5 && lng > -18.3 && lng < -13.3)

/**
 * Nominatim lookup (≥1.1 s between calls, cached, backs off on 429, Photon
 * fallback). Restricted to Spain unless `anywhere` is set.
 */
export async function geocodeEs(query: string, anywhere = false): Promise<{ lat: number; lng: number } | null> {
  const q = query.replace(/\s+/g, ' ').trim()
  if (!q) return null
  const key = `${anywhere ? '*' : 'es'}|${q}`
  if (geoCache.has(key)) return geoCache.get(key)!
  const ok = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && (anywhere ? !(lat === 0 && lng === 0) : inSpain(lat, lng))
  for (let attempt = 0; attempt < 3 && Date.now() >= nominatimPausedUntil; attempt++) {
    const wait = lastGeo + 1100 + attempt * 4000 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1${anywhere ? '' : '&countrycodes=es'}&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'es' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 2) nominatimPausedUntil = Date.now() + 5 * 60000
        continue
      }
      if (!res.ok) break
      const d = await res.json()
      let out: { lat: number; lng: number } | null = null
      if (d[0]) {
        const lat = parseFloat(d[0].lat), lng = parseFloat(d[0].lon)
        if (ok(lat, lng)) out = { lat, lng }
      }
      geoCache.set(key, out)
      return out
    } catch { /* retry */ }
  }
  const pw = lastGeo + 1100 - Date.now()
  if (pw > 0) await new Promise((r) => setTimeout(r, pw))
  lastGeo = Date.now()
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?limit=1${anywhere ? '' : '&bbox=-18.3,27.5,4.5,43.9'}&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      const f = d?.features?.[0]
      let out: { lat: number; lng: number } | null = null
      if (f?.geometry?.coordinates && (anywhere || (f.properties?.countrycode ?? 'ES') === 'ES')) {
        const [lng, lat] = f.geometry.coordinates
        if (ok(lat, lng)) out = { lat, lng }
      }
      geoCache.set(key, out)
      return out
    }
  } catch { /* give up */ }
  return null
}

/** Try several queries in order (most specific first). */
export async function geocodeEsFirst(queries: string[], anywhere = false): Promise<{ lat: number; lng: number } | null> {
  for (const q of queries) {
    const r = await geocodeEs(q, anywhere)
    if (r) return r
  }
  return null
}
