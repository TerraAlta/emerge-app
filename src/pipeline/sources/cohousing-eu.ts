/**
 * Cohousing Europe — collaborative / cooperative housing events across Europe.
 *
 * cohousing.eu is a parked domain (for sale), and the new European Alliance
 * for Collaborative Housing (collaborativehousing.eu) has no events data. The
 * European Housing Coop platform (housingcoop.eu) curates Europe-wide
 * housing-cooperative, community-led and collaborative housing events and
 * publishes them as an iCalendar feed: /feed/events.ics (advertised by its
 * /api/calendar/config). Entries are all-day (DTSTART;VALUE=DATE) with a
 * "City, Country" LOCATION, so starts are 10:00 local in that country's zone
 * and ends 18:00 local on the last day (DTEND is exclusive).
 *
 * The feed also lists generic proptech / smart-city trade fairs (MIPIM,
 * Smart City Expo…); those are dropped by title. Cities are geocoded once.
 */
import type { RawEvent, SourceFetcher } from './types'
import { hashStr } from './utils'
import { getText, geocodeEu, tzForCountry, zonedIso, ONLINE_RE, COUNTRY_CC } from './eu-common'

const SRC = 'cohousing-eu'
const FEED = 'https://www.housingcoop.eu/feed/events.ics'
const MAX_GEOCODES = 25
const TRADE_FAIR_RE = /\b(MIPIM|Expo|Smart City|Smart Country|PropTech|Real Estate|Investor|EXPO REAL|Immobilien|Web Summit)\b/i

function unescapeIcs(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim()
}

function ymd(v: string): [number, number, number] | null {
  const m = v.match(/(\d{4})(\d{2})(\d{2})/)
  return m ? [+m[1], +m[2], +m[3]] : null
}

export const cohousingEu: SourceFetcher = {
  name: SRC,
  async fetch() {
    const text = await getText(FEED)
    if (!text) return []
    const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
    const raw: Record<string, string>[] = []
    let cur: Record<string, string> | null = null
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { cur = {}; continue }
      if (line === 'END:VEVENT') { if (cur) raw.push(cur); cur = null; continue }
      if (!cur) continue
      const i = line.indexOf(':')
      if (i < 0) continue
      const key = line.slice(0, i).split(';')[0].toUpperCase()
      if (!(key in cur)) cur[key] = line.slice(i + 1)
    }

    const geo = new Map<string, { lat: number; lng: number } | null>()
    const events: RawEvent[] = []
    for (const r of raw) {
      const title = unescapeIcs(r.SUMMARY ?? '')
      const location = unescapeIcs(r.LOCATION ?? '')
      if (!title || !location || ONLINE_RE.test(location) || TRADE_FAIR_RE.test(title)) continue
      if ((r.STATUS ?? '').toUpperCase() === 'CANCELLED') continue
      const parts = location.split(',').map((x) => x.trim()).filter(Boolean)
      const country = parts[parts.length - 1] ?? ''
      const tz = tzForCountry(country)
      if (!tz) continue // outside Europe (or unknown)

      const s = ymd(r.DTSTART ?? '')
      if (!s) continue
      const starts = zonedIso(tz, s[0], s[1], s[2], 10, 0)
      if (!starts || new Date(starts).getTime() < Date.now()) continue
      let ends: string | null = null
      const e = ymd(r.DTEND ?? '')
      if (e) {
        const last = new Date(Date.UTC(e[0], e[1] - 1, e[2]) - 86400000) // exclusive DTEND
        ends = zonedIso(tz, last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate(), 18, 0)
        if (ends && ends <= starts) ends = null
      }

      if (!geo.has(location)) {
        if (geo.size >= MAX_GEOCODES) continue
        geo.set(location, await geocodeEu(location, COUNTRY_CC[country.toLowerCase()]))
      }
      const loc = geo.get(location)
      if (!loc) continue

      const description = unescapeIcs(r.DESCRIPTION ?? '').replace(/\s*\[\d+\](\[\d+\])*/g, '').replace(/\s+/g, ' ')
      const url = unescapeIcs(r.URL ?? '') || 'https://www.housingcoop.eu/resources/events'
      events.push({
        source: SRC,
        source_id: `cohousing-${hashStr(r.UID ?? title + starts)}`,
        source_url: url,
        title,
        description: description.slice(0, 500) || `${title} — collaborative housing event in ${location}.`,
        organizer: 'European Housing Coop (listing)',
        location_name: location,
        lat: loc.lat,
        lng: loc.lng,
        starts_at: starts,
        ends_at: ends,
        cost: 'See event page',
      })
    }
    return events
  },
}
