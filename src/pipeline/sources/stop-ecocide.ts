/**
 * Stop Ecocide International — stopecocide.earth/events
 *
 * The site is Squarespace; its events collection is available as JSON at
 * /events?format=json → `upcoming[]` with title, body, startDate/endDate
 * (epoch ms) and a `location` block (addressTitle, addressLine1/2,
 * addressCountry, markerLat/markerLng).
 *
 * Squarespace stores times as the editor typed them in the SITE time zone
 * (website.timeZone, Europe/Amsterdam), e.g. a London talk "10am – 3pm" is
 * stored as 10:00 Amsterdam. We therefore read the wall-clock time in the
 * site zone and re-interpret it in the venue's own zone.
 *
 * Events without a real venue (empty address + Squarespace's default
 * New York map pin) are online/unspecified and are skipped, as are
 * webinar/online events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getJson, tzFor, zonedIso, ONLINE_RE } from './global-net-common'

const SRC = 'stop-ecocide'
const BASE = 'https://www.stopecocide.earth'
const DEFAULT_PIN = { lat: 40.7207559, lng: -74.0007613 }

interface SqLocation {
  addressTitle?: string
  addressLine1?: string
  addressLine2?: string
  addressCountry?: string
  markerLat?: number
  markerLng?: number
  mapLat?: number
  mapLng?: number
}
interface SqEvent {
  id: string
  title?: string
  body?: string
  excerpt?: string
  fullUrl?: string
  assetUrl?: string
  startDate?: number
  endDate?: number
  location?: SqLocation
}

function wallClock(tz: string, ts: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute }
}

export const stopEcocide: SourceFetcher = {
  name: SRC,
  async fetch() {
    const d = await getJson<{ website?: { timeZone?: string }; upcoming?: SqEvent[] }>(`${BASE}/events?format=json`)
    if (!d?.upcoming?.length) return []
    const siteTz = d.website?.timeZone || 'Europe/Amsterdam'

    const now = Date.now()
    const events: RawEvent[] = []
    for (const e of d.upcoming) {
      const title = stripHtml(e.title ?? '')
      if (!title || !e.startDate) continue
      const body = stripHtml(e.body ?? e.excerpt ?? '').replace(/\s+/g, ' ').trim()
      if (ONLINE_RE.test(title)) continue

      const loc = e.location ?? {}
      const lat = Number(loc.markerLat ?? loc.mapLat)
      const lng = Number(loc.markerLng ?? loc.mapLng)
      const hasAddr = !!(loc.addressLine1 || loc.addressLine2)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue
      const isDefaultPin = Math.abs(lat - DEFAULT_PIN.lat) < 1e-4 && Math.abs(lng - DEFAULT_PIN.lng) < 1e-4
      if (isDefaultPin || !hasAddr) continue
      // venue known, but the body says it's online-only
      if (/\b(webinar|zoom|online event|livestream)\b/i.test(body) && !/in[- ]person|venue/i.test(body)) continue

      const tz = tzFor(loc.addressCountry, lat, lng, loc.addressLine2 ?? '')
      if (!tz) continue
      const s = wallClock(siteTz, Number(e.startDate))
      const startsAt = zonedIso(tz, s.y, s.mo, s.d, s.h, s.mi)
      if (!startsAt || Date.parse(startsAt) < now + 3600_000) continue
      let endsAt: string | null = null
      if (e.endDate) {
        const en = wallClock(siteTz, Number(e.endDate))
        endsAt = zonedIso(tz, en.y, en.mo, en.d, en.h, en.mi)
        if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = null
      }

      const place = [loc.addressTitle, loc.addressLine1, loc.addressLine2, loc.addressCountry]
        .map((x) => (x ?? '').trim()).filter(Boolean).join(', ')
      events.push({
        source: SRC,
        source_id: `sei-${e.id}`,
        source_url: e.fullUrl ? `${BASE}${e.fullUrl}` : `${BASE}/events`,
        title,
        description: body.slice(0, 800),
        organizer: 'Stop Ecocide International',
        location_name: place,
        lat,
        lng,
        starts_at: startsAt,
        ends_at: endsAt,
        cost: /\bfree\b/i.test(body) ? 'Free' : 'See event page',
        image_url: e.assetUrl ?? null,
      })
    }
    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return events
  },
}
