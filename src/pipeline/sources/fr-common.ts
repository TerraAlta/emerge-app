/**
 * Shared helpers for the French network sources (colibris-fr, terredeliens-fr,
 * amap-fr, miramap-fr, permaculture-fr, transition-fr): polite fetching,
 * Europe/Paris → UTC conversion, French month names, a minimal iCalendar
 * parser and a cached, rate-limited Nominatim geocoder (FR/BE).
 */

export const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'

export async function getText(url: string, timeoutMs = 20000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json,text/calendar,*/*' },
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

export const FR_MONTHS: Record<string, number> = {
  janvier: 1, 'février': 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  'août': 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, 'décembre': 12, decembre: 12,
  janv: 1, jan: 1, 'févr': 2, 'fév': 2, fevr: 2, fev: 2, mar: 3, avr: 4, juil: 7, jui: 7,
  sept: 9, sep: 9, oct: 10, nov: 11, 'déc': 12, dec: 12,
}

/** Month name / abbreviation (any case, optional trailing dot) → 1..12. */
export function frMonth(s: string): number | undefined {
  return FR_MONTHS[s.toLowerCase().replace(/\.$/, '')]
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

/**
 * Europe/Paris wall-clock time → ISO UTC (handles CET/CEST). Brussels uses
 * the same rules, so this is also right for Belgian venues.
 */
export function parisIso(y: number, mo: number, d: number, h = 0, mi = 0): string | null {
  if (!(y > 2000 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h >= 0 && h < 24 && mi >= 0 && mi < 60)) return null
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - parisOffsetMin(guess) * 60000
  return new Date(guess - parisOffsetMin(first) * 60000).toISOString()
}

// ── iCalendar ────────────────────────────────────────────────────────────

export interface IcsEvent {
  uid: string
  start: string
  end: string | null
  allDay: boolean
  summary: string
  description: string
  location: string
  url: string
  status: string
  rrule: string
}

function unescapeIcs(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim()
}

/**
 * "20261012T103000Z" (UTC), "20261012T103000" with TZID (treated as
 * Europe/Paris / Brussels — the only zones these feeds use) or "20261012".
 */
function icsDate(v: string): { iso: string; allDay: boolean } | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/)
  if (!m) return null
  const [y, mo, d] = [+m[1], +m[2], +m[3]]
  if (!m[4]) {
    const iso = parisIso(y, mo, d, 0, 0)
    return iso ? { iso, allDay: true } : null
  }
  const [h, mi] = [+m[4], +m[5]]
  if (m[7]) return { iso: new Date(Date.UTC(y, mo - 1, d, h, mi)).toISOString(), allDay: false }
  const iso = parisIso(y, mo, d, h, mi)
  return iso ? { iso, allDay: false } : null
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const out: IcsEvent[] = []
  let cur: Record<string, string> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT') {
      if (cur?.UID && cur.DTSTART && cur.SUMMARY) {
        const s = icsDate(cur.DTSTART)
        if (s) {
          let end = cur.DTEND ? icsDate(cur.DTEND) : null
          // All-day DTEND is exclusive: step back one day
          if (end && end.allDay) end = { iso: new Date(new Date(end.iso).getTime() - 86400000).toISOString(), allDay: true }
          out.push({
            uid: cur.UID,
            start: s.iso,
            end: end && end.iso > s.iso ? end.iso : null,
            allDay: s.allDay,
            summary: unescapeIcs(cur.SUMMARY),
            description: unescapeIcs(cur.DESCRIPTION ?? ''),
            location: unescapeIcs(cur.LOCATION ?? ''),
            url: unescapeIcs(cur.URL ?? ''),
            status: (cur.STATUS ?? '').toUpperCase(),
            rrule: cur.RRULE ?? '',
          })
        }
      }
      cur = null
      continue
    }
    if (!cur) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).split(';')[0].toUpperCase()
    if (!(key in cur)) cur[key] = line.slice(idx + 1)
  }
  return out
}

/** Online-only markers (skip these events). */
export const ONLINE_RE = /\b(en ligne|visio(conf[ée]rence)?|webinai?re?s?|zoom|online|distanciel)\b/i

// ── Geocoding ────────────────────────────────────────────────────────────

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastGeo = 0
let nominatimPausedUntil = 0

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Guard against street-only matches in the wrong town (e.g. a misspelt
 * "Carcassone, … Avenue Pierre Semard" matching that avenue in Grenoble):
 * one of the hit's place names must appear in the query.
 */
function placeInQuery(addr: Record<string, string> | undefined, q: string): boolean {
  if (!addr) return true
  const nq = norm(q)
  const names = ['city', 'town', 'village', 'municipality', 'hamlet', 'suburb', 'city_district', 'county', 'state', 'region', 'postcode']
    .map((k) => norm(String(addr[k] ?? ''))).filter((n) => n.length >= 3)
  if (!names.length) return true
  return names.some((n) => nq.includes(n.slice(0, 6)))
}

function inFrBe(lat: number, lng: number): boolean {
  // Metropolitan France + Corsica + Belgium
  return lat > 41.2 && lat < 51.6 && lng > -5.6 && lng < 9.7
}

/** Nominatim lookup restricted to FR/BE; ≥1.1 s between calls, cached, backs off on 429 (then BAN / Photon). */
export async function geocodeFr(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.replace(/\s+/g, ' ').trim()
  if (!q) return null
  if (geoCache.has(q)) return geoCache.get(q)!
  for (let attempt = 0; attempt < 3 && Date.now() >= nominatimPausedUntil; attempt++) {
    const wait = lastGeo + 1100 + attempt * 4000 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=fr,be&q=${encodeURIComponent(q)}`,
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
        if (inFrBe(lat, lng) && placeInQuery(d[0].address, q)) out = { lat, lng }
      }
      geoCache.set(q, out)
      return out
    } catch { /* network error: retry */ }
  }
  // Nominatim kept refusing (shared IP): fall back to the French national
  // address base (BAN, api-adresse.data.gouv.fr — free, keyless, France only),
  // then Photon (komoot's OSM geocoder, also covers Belgium).
  try {
    const res = await fetch(
      `https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(q.slice(0, 190))}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      const f = d?.features?.[0]
      // BAN happily matches a street named after the town/department
      // ("Rue de Savoie" somewhere), so the hit's commune must appear in the query.
      const city = norm(String(f?.properties?.city ?? f?.properties?.name ?? ''))
      if (f?.geometry?.coordinates && (f.properties?.score ?? 0) >= 0.5 && city && norm(q).includes(city.slice(0, 6))) {
        const [lng, lat] = f.geometry.coordinates
        if (inFrBe(lat, lng)) {
          const out = { lat, lng }
          geoCache.set(q, out)
          return out
        }
      }
    }
  } catch { /* try Photon */ }
  const pw = lastGeo + 1100 - Date.now()
  if (pw > 0) await new Promise((r) => setTimeout(r, pw))
  lastGeo = Date.now()
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?limit=1&bbox=-5.6,41.2,9.7,51.6&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      const f = d?.features?.[0]
      let out: { lat: number; lng: number } | null = null
      if (f?.geometry?.coordinates) {
        const [lng, lat] = f.geometry.coordinates
        if (inFrBe(lat, lng)) out = { lat, lng }
      }
      geoCache.set(q, out)
      return out
    }
  } catch { /* give up */ }
  return null
}

/** Try several queries in order (most specific first). */
export async function geocodeFrFirst(queries: string[]): Promise<{ lat: number; lng: number } | null> {
  const seen = new Set<string>()
  for (const q of queries) {
    const k = q.replace(/\s+/g, ' ').trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    const r = await geocodeFr(k)
    if (r) return r
  }
  return null
}
