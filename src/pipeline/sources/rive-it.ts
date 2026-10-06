/**
 * RIVE — Rete Italiana Villaggi Ecologici (ecovillaggi.it)
 * Italian ecovillage network events: open days, residential weekends,
 * courses hosted by member ecovillages.
 *
 * The site is Joomla + JEM. Its month calendar (/eventi) offers an iCalendar
 * export per month:
 *   /eventi.raw?yearID=YYYY&monthID=M&layout=ics
 * Times are TZID=Europe/Rome. Multi-day events are emitted once per day with
 * the same UID, so we keep the earliest DTSTART and latest DTEND per UID.
 * We read the current month plus the next 5 (6 requests). Online seminars
 * are skipped; venues are geocoded via Nominatim (cached).
 */
import type { RawEvent, SourceFetcher } from './types'
import { hashStr } from './utils'
import { getText, romeIso, geocodeFirst } from './italy-common'

const SRC = 'rive-it'
const BASE = 'https://ecovillaggi.it'
const MONTHS_AHEAD = 6
const MAX_EVENTS = 200

interface IcsEvent {
  uid: string
  start: string
  end: string | null
  summary: string
  description: string
  location: string
  url: string
}

function unescapeIcs(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim()
}

/** "20261012T103000" (Europe/Rome) or "20261012" → ISO UTC. */
function icsDate(v: string, isUtc: boolean): string | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/)
  if (!m) return null
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0]
  if (isUtc) return new Date(Date.UTC(y, mo - 1, d, h, mi)).toISOString()
  return romeIso(y, mo, d, h, mi)
}

function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const out: IcsEvent[] = []
  let cur: Record<string, string> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT') {
      if (cur?.UID && cur.DTSTART && cur.SUMMARY) {
        const startIso = icsDate(cur.DTSTART, cur.DTSTART.endsWith('Z'))
        if (startIso) {
          out.push({
            uid: cur.UID,
            start: startIso,
            end: cur.DTEND ? icsDate(cur.DTEND, cur.DTEND.endsWith('Z')) : null,
            summary: unescapeIcs(cur.SUMMARY),
            description: unescapeIcs(cur.DESCRIPTION ?? ''),
            location: unescapeIcs(cur.LOCATION ?? ''),
            url: unescapeIcs(cur.URL ?? ''),
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
    cur[key] = line.slice(idx + 1)
  }
  return out
}

export const riveIt: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = new Date()
    const byUid = new Map<string, IcsEvent>()
    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))
      const ics = await getText(`${BASE}/eventi.raw?yearID=${d.getUTCFullYear()}&monthID=${d.getUTCMonth() + 1}&layout=ics`)
      if (!ics || !ics.includes('BEGIN:VCALENDAR')) continue
      for (const ev of parseIcs(ics)) {
        const prev = byUid.get(ev.uid)
        if (!prev) { byUid.set(ev.uid, ev); continue }
        if (ev.start < prev.start) prev.start = ev.start
        if (ev.end && (!prev.end || ev.end > prev.end)) prev.end = ev.end
      }
    }

    const events: RawEvent[] = []
    for (const ev of byUid.values()) {
      if (events.length >= MAX_EVENTS) break
      if (new Date(ev.start).getTime() < Date.now()) continue
      if (/\b(online|webinar|zoom)\b/i.test(`${ev.summary} ${ev.location}`)) continue
      if (!ev.location) continue

      // "Ecovillaggio Tempo di Vivere,Loc. Camera Vecchia di Calenzano,29021 Bettola,Italy"
      const parts = ev.location.split(',').map((s) => s.trim()).filter((s) => s && !/^ital(y|ia)$/i.test(s))
      const town = parts.length > 1 ? parts[parts.length - 1] : ''
      const geo = await geocodeFirst([
        parts.slice(1).join(', '),
        parts.join(', '),
        town,
        town.replace(/^\d{5}\s+/, ''),
      ].filter(Boolean))
      if (!geo) continue

      const descr = ev.description
        .replace(/\n?Categoria\s*:[^\n]*/i, '')
        .replace(/\n?Link\s*:[^\n]*/i, '')
        .trim()
      const idm = ev.uid.match(/event(\d+)/)
      events.push({
        source: SRC,
        source_id: `rive-${idm ? idm[1] : hashStr(ev.uid)}`,
        source_url: ev.url || `${BASE}/eventi`,
        title: ev.summary,
        description: (descr || ev.summary).slice(0, 500),
        organizer: parts[0] || 'RIVE — Rete Italiana Villaggi Ecologici',
        location_name: parts.join(', ').slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: ev.start,
        ends_at: ev.end && ev.end > ev.start ? ev.end : null,
        cost: 'Vedi evento',
      })
    }
    return events
  },
}
