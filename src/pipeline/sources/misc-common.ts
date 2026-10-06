/**
 * Shared helpers for sources outside the per-country helper files (Canada,
 * Malta, Ireland, UK/DE art spaces, Zürich): polite fetching, wall-clock time
 * in any IANA zone → UTC, English month names, and a cached, rate-limited
 * Nominatim geocoder restricted to given countries (≥1.1 s between calls,
 * backs off on 429).
 */

export const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** GET (or POST when `body` is given) as text; one retry after 2 s on a network error or 429/5xx. */
export async function getText(
  url: string,
  opts: { timeoutMs?: number; accept?: string; body?: string } = {},
): Promise<string | null> {
  const { timeoutMs = 20000, accept = 'text/html,application/json,*/*', body } = opts
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(2000)
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          'User-Agent': UA,
          Accept: accept,
          ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return await res.text()
      if (res.status !== 429 && res.status < 500) return null
    } catch { /* retry */ }
  }
  return null
}

export async function getJson<T = any>(url: string, timeoutMs = 20000): Promise<T | null> {
  const t = await getText(url, { timeoutMs, accept: 'application/json' })
  if (!t) return null
  try { return JSON.parse(t) as T } catch { return null }
}

export const EN_MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
}

/** English month name / abbreviation (any case, optional trailing dot) → 1..12. */
export function enMonth(s: string | undefined): number | undefined {
  return s ? EN_MONTHS[s.toLowerCase().replace(/\.$/, '')] : undefined
}

function offsetMin(tz: string, ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** Wall-clock time in IANA zone `tz` → ISO UTC (DST aware); null if invalid. */
export function zonedIso(tz: string, y: number, mo: number, d: number, h = 10, mi = 0): string | null {
  if (!(y > 2000 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h >= 0 && h < 24 && mi >= 0 && mi < 60)) return null
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  if (new Date(guess).getUTCDate() !== d) return null // e.g. 31 Nov
  const first = guess - offsetMin(tz, guess) * 60000
  return new Date(guess - offsetMin(tz, first) * 60000).toISOString()
}

/** "7pm", "7.30pm", "19:30", "11:00 am" → [h, m] (24h); null if no time. */
export function parseClock(s: string, defaultMeridiem?: 'am' | 'pm'): [number, number] | null {
  const m = s.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i)
  if (!m) return null
  let h = +m[1]
  const mi = m[2] ? +m[2] : 0
  const mer = m[3] ? (m[3][0].toLowerCase() as 'a' | 'p') : defaultMeridiem?.[0]
  if (!m[3] && !m[2] && !defaultMeridiem) return null // a bare number is not a time
  if (mer === 'p' && h < 12) h += 12
  if (mer === 'a' && h === 12) h = 0
  if (h > 23 || mi > 59) return null
  return [h, mi]
}

/** Online-only markers (skip these events). */
export const ONLINE_RE = /\b(online|webinar|virtual|zoom|livestream|live stream|ms teams|microsoft teams)\b/i

// ── Geocoding ────────────────────────────────────────────────────────────

export type LatLng = { lat: number; lng: number }

const geoCache = new Map<string, LatLng | null>()
let lastGeo = 0
let pausedUntil = 0

/**
 * Nominatim lookup restricted to `countrycodes` (e.g. "ca", "mt", "gb,ie");
 * ≥1.1 s between calls (shared across sources in this file), cached, waits and
 * retries on 429 and pauses for 5 min after repeated refusals.
 */
export async function geocode(query: string, countrycodes: string): Promise<LatLng | null> {
  const q = query.replace(/\s+/g, ' ').trim()
  if (!q) return null
  const key = `${countrycodes}|${q}`
  if (geoCache.has(key)) return geoCache.get(key)!
  for (let attempt = 0; attempt < 3 && Date.now() >= pausedUntil; attempt++) {
    const wait = lastGeo + 1100 + attempt * 5000 - Date.now()
    if (wait > 0) await sleep(wait)
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=${countrycodes}&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 2) pausedUntil = Date.now() + 5 * 60000
        continue
      }
      if (!res.ok) break
      const d = await res.json()
      const out = d[0] ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) } : null
      const ok = out && Number.isFinite(out.lat) && Number.isFinite(out.lng) && (out.lat !== 0 || out.lng !== 0)
      geoCache.set(key, ok ? out : null)
      return ok ? out : null
    } catch { /* network error: retry */ }
  }
  return null
}

/** Try several queries in order (most specific first). */
export async function geocodeFirst(queries: string[], countrycodes: string): Promise<LatLng | null> {
  const seen = new Set<string>()
  for (const q of queries) {
    const k = q.replace(/\s+/g, ' ').trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    const r = await geocode(k, countrycodes)
    if (r) return r
  }
  return null
}

/**
 * "10–11.30am", "5–8pm", "11.30am–12.30pm", "14:00–16:00", "7pm" →
 * [[h,m] | null, [h,m] | null]. A start without am/pm borrows the end's,
 * unless that would put it after the end ("10–1pm" → 10:00–13:00).
 */
export function parseTimeRange(s: string): [[number, number] | null, [number, number] | null] {
  const r = s.match(/(\d{1,2}(?:[:.]\d{2})?)\s*(a\.?m\.?|p\.?m\.?)?\s*(?:[-–—]|to)\s*(\d{1,2}(?:[:.]\d{2})?)\s*(a\.?m\.?|p\.?m\.?)?/i)
  if (r) {
    const merOf = (x?: string) => (x ? (x[0].toLowerCase() === 'p' ? 'pm' : 'am') : undefined) as 'am' | 'pm' | undefined
    const m1 = merOf(r[2])
    const m2 = merOf(r[4])
    const en = parseClock(r[3], m2 ?? (r[3].includes(':') ? undefined : m1))
    let st = parseClock(r[1], m1 ?? (r[1].includes(':') && !m2 ? undefined : m2))
    if (st && en && !m1 && m2 && st[0] * 60 + st[1] > en[0] * 60 + en[1]) st = parseClock(r[1], 'am')
    return [st, en]
  }
  const one = s.match(/\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\d{1,2}:\d{2}/i)
  return [one ? parseClock(one[0]) : null, null]
}
