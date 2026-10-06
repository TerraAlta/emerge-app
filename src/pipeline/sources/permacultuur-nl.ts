/**
 * PermacultuurNetwerk Belgium + Netherlands
 * permacultuurnetwerk.eu — courses, workshops, open days
 *
 * The calendar (/cursussen/kalender/) runs on Events Manager, which publishes
 * every upcoming event as iCal at /events.ics: start/end with TZID, summary,
 * URL, category, description and — when the event has a venue — LOCATION and
 * GEO (lat;lng). Events without a venue but with a town in the title
 * ("… - Eindhoven") are geocoded with Nominatim; others are skipped. Online
 * activities are skipped.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'permacultuur-nl'
const ORG = 'PermacultuurNetwerk'
const ICS = 'https://permacultuurnetwerk.eu/events.ics'
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_EVENTS = 200

function zoneOffsetMin(ts: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** iCal date value (+ optional TZID) → ISO UTC, or null */
function icsDate(value: string, tzid: string | undefined): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/)
  if (!m) return null
  const [, y, mo, d, h = '00', mi = '00', , z] = m
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi)
  if (z) return new Date(wall).toISOString()
  let tz = tzid || 'Europe/Amsterdam'
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }) } catch { tz = 'Europe/Amsterdam' }
  return new Date(wall - zoneOffsetMin(wall, tz) * 60000).toISOString()
}

function unescapeIcs(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
}

interface VEvent { [key: string]: { value: string; params: Record<string, string> } }

function parseIcs(text: string): VEvent[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const out: VEvent[] = []
  let cur: VEvent | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT') { if (cur) out.push(cur); cur = null; continue }
    if (!cur) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const [name, ...params] = line.slice(0, idx).split(';')
    const p: Record<string, string> = {}
    for (const kv of params) { const [k, v] = kv.split('='); if (k && v) p[k.toUpperCase()] = v }
    if (!cur[name.toUpperCase()]) cur[name.toUpperCase()] = { value: line.slice(idx + 1), params: p }
  }
  return out
}

let lastNominatim = 0
const geoCache = new Map<string, { lat: number; lng: number } | null>()
async function nominatim(q: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache.has(q)) return geoCache.get(q)!
  const wait = lastNominatim + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastNominatim = Date.now()
  let out: { lat: number; lng: number } | null = null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=nl,be&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': UA, 'Accept-Language': 'nl' }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      if (d[0]) out = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
    }
  } catch { /* none */ }
  geoCache.set(q, out)
  return out
}

export const permacultuurNl: SourceFetcher = {
  name: SRC,
  async fetch() {
    let text: string
    try {
      const res = await fetch(ICS, {
        headers: { 'User-Agent': UA, Accept: 'text/calendar' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) return []
      text = await res.text()
    } catch {
      return []
    }

    const now = Date.now()
    const events: RawEvent[] = []
    for (const ev of parseIcs(text)) {
      const title = unescapeIcs(ev.SUMMARY?.value ?? '').trim()
      const startsAt = ev.DTSTART ? icsDate(ev.DTSTART.value, ev.DTSTART.params.TZID) : null
      if (!title || !startsAt) continue
      if (Date.parse(startsAt) < now + 3600_000) continue
      const endsAt = ev.DTEND ? icsDate(ev.DTEND.value, ev.DTEND.params.TZID) : null
      const category = unescapeIcs(ev.CATEGORIES?.value ?? '')
      const location = unescapeIcs(ev.LOCATION?.value ?? '').replace(/[\s,\\]+$/, '').trim()
      if (/online|webinar|zoom/i.test(`${title} ${category} ${location}`)) continue

      let lat = NaN
      let lng = NaN
      const g = ev.GEO?.value.match(/^(-?\d+(?:\.\d+)?);(-?\d+(?:\.\d+)?)$/)
      if (g) { lat = parseFloat(g[1]); lng = parseFloat(g[2]) }
      let place = location
      if (!(lat > 49 && lat < 54 && lng > 2 && lng < 7.5)) {
        // No venue: use a town named in the title ("… - Eindhoven")
        const town = title.match(/\s[-–]\s([A-Z][\w'’ -]{2,40})$/)?.[1]?.trim()
        const geo = location ? await nominatim(location) : town ? await nominatim(town) : null
        if (!geo) continue
        lat = geo.lat; lng = geo.lng
        place = location || town || ''
      }

      const url = ev.URL?.value?.trim() || 'https://permacultuurnetwerk.eu/cursussen/kalender/'
      const desc = stripHtml(unescapeIcs(ev.DESCRIPTION?.value ?? '')).slice(0, 500)
      const end = endsAt && Date.parse(endsAt) > Date.parse(startsAt) ? endsAt : null
      events.push({
        source: SRC,
        source_id: `pcn-${(ev.UID?.value ?? url).replace(/@.*/, '')}-${startsAt.slice(0, 10)}`,
        source_url: url,
        title,
        description: desc || `${ORG} activiteit.`,
        organizer: ORG,
        location_name: place.split(',').slice(0, 3).join(',').trim() || 'Nederland/België',
        lat, lng,
        starts_at: startsAt,
        ends_at: end,
        cost: 'Zie website',
      })
      if (events.length >= MAX_EVENTS) break
    }
    return events
  },
}
