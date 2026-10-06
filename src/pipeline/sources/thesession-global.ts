/**
 * The Session — thesession.org — Irish traditional music events worldwide.
 *
 * The Session has a public, keyless JSON API (https://thesession.org/api).
 * We read /events/upcoming?format=json — concerts, céilís, festivals,
 * workshops and album launches with a specific date, venue coordinates and
 * town/area/country. (Weekly recurring pub "sessions" live under /sessions
 * and have no specific date, so they are NOT events and are not used.)
 *
 * dtstart/dtend are venue-local wall-clock times; "00:00:00" means the
 * listing has no start time (date-only → 10:00 local). Time zones come from
 * the country (+ US state / Canadian province / Australian state for
 * multi-zone countries). Online events (venue "Online", no coordinates)
 * are skipped. Descriptions come from the event's first comment, fetched
 * for the soonest events only to stay polite.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getJson, sleep, tzFor, zonedIso, ONLINE_RE } from './global-net-common'

const SRC = 'thesession-global'
const BASE = 'https://thesession.org'
const MAX_PAGES = 6
const MAX_DETAILS = 30
const MAX_EVENTS = 200

interface TsEvent {
  id: number
  name: string
  url?: string
  dtstart?: string
  dtend?: string
  latitude?: number
  longitude?: number
  venue?: { name?: string; web?: string }
  town?: { name?: string }
  area?: { name?: string }
  country?: { name?: string }
  comments?: { content?: string }[]
}

function parseDt(s: string | undefined): { y: number; mo: number; d: number; h: number; mi: number; dateOnly: boolean } | null {
  const m = (s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return null
  const h = +m[4]
  const mi = +m[5]
  return { y: +m[1], mo: +m[2], d: +m[3], h, mi, dateOnly: h === 0 && mi === 0 }
}

export const theSessionGlobal: SourceFetcher = {
  name: SRC,
  async fetch() {
    const raw: TsEvent[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const d = await getJson<{ pages?: number; events?: TsEvent[] }>(
        `${BASE}/events/upcoming?format=json&perpage=50&page=${page}`,
      )
      if (!d?.events?.length) break
      raw.push(...d.events)
      if (!d.pages || page >= d.pages) break
      await sleep(1000)
    }

    const now = Date.now()
    const events: RawEvent[] = []
    const seen = new Set<number>()
    for (const e of raw) {
      if (!e?.id || seen.has(e.id)) continue
      const title = stripHtml(e.name ?? '')
      const venue = stripHtml(e.venue?.name ?? '')
      const lat = Number(e.latitude)
      const lng = Number(e.longitude)
      if (!title || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue
      if (/^online$/i.test(venue) || ONLINE_RE.test(title)) continue

      const country = e.country?.name ?? ''
      const area = e.area?.name ?? ''
      const tz = tzFor(country, lat, lng, area)
      if (!tz) continue

      const st = parseDt(e.dtstart)
      if (!st) continue
      const startsAt = zonedIso(tz, st.y, st.mo, st.d, st.dateOnly ? 10 : st.h, st.dateOnly ? 0 : st.mi)
      if (!startsAt || Date.parse(startsAt) < now + 3600_000) continue

      let endsAt: string | null = null
      const en = parseDt(e.dtend)
      if (en) {
        const sameDay = en.y === st.y && en.mo === st.mo && en.d === st.d
        if (!sameDay) {
          endsAt = zonedIso(tz, en.y, en.mo, en.d, en.dateOnly ? 18 : en.h, en.dateOnly ? 0 : en.mi)
        } else if (!en.dateOnly && (en.h * 60 + en.mi) > (st.h * 60 + st.mi)) {
          endsAt = zonedIso(tz, en.y, en.mo, en.d, en.h, en.mi)
        }
        if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = null
      }

      seen.add(e.id)
      const town = e.town?.name ?? ''
      const place = [venue && !/^various venues$/i.test(venue) ? venue : '', town, area !== town ? area : '', country]
        .filter(Boolean).join(', ')
      events.push({
        source: SRC,
        source_id: `ts-event-${e.id}`,
        source_url: e.url ?? `${BASE}/events/${e.id}`,
        title,
        description: `Irish traditional music event listed on The Session${place ? ` — ${place}` : ''}.`,
        organizer: venue && !/^various venues$/i.test(venue) ? venue : 'The Session community',
        location_name: place || town || country,
        lat,
        lng,
        starts_at: startsAt,
        ends_at: endsAt,
        cost: 'See event',
      })
    }

    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    const out = events.slice(0, MAX_EVENTS)

    // Enrich the soonest events with the organiser's own description.
    for (const ev of out.slice(0, MAX_DETAILS)) {
      await sleep(1000)
      const id = ev.source_id.replace('ts-event-', '')
      const d = await getJson<TsEvent>(`${BASE}/events/${id}?format=json`)
      const txt = stripHtml(d?.comments?.[0]?.content ?? '').replace(/\s+/g, ' ').trim()
      if (!txt) continue
      if (ONLINE_RE.test(txt) && /\b(zoom|online only|webinar)\b/i.test(txt) && !/in[- ]person/i.test(txt)) {
        ev.title = '' // mark for removal: actually an online event
        continue
      }
      ev.description = `${txt.slice(0, 600)}${txt.length > 600 ? '…' : ''} (${ev.location_name})`
    }
    return out.filter((e) => e.title)
  },
}
