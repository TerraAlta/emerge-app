/**
 * Zero Waste Europe — zerowasteeurope.eu/resources/events/
 *
 * The events page lists upcoming events (a.event-top) and recent ones
 * (a.single-post-card), each tagged with a type badge — "Online"
 * (event-type-online) or "In-person" (event-type-live) — plus a date
 * ("15 October 2026" or "16/10/2025 - 17/10/2025") and optionally a time
 * ("14:00 – 15:00 (CET/CEST)"). Nearly everything is a webinar; the in-person
 * ones (conferences, study tours, the Zero Waste Festival) are a few a year.
 *
 * Online events are skipped. For future in-person ones the detail page gives
 * the place ("Location: Tallinn, Estonia"), which is geocoded; events with no
 * findable place are skipped. Times marked CET/CEST are Brussels time;
 * otherwise the venue's zone is used, and date-only starts are 10:00 local.
 */
import * as cheerio from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, geocodeEu, zonedIso, CC_TZ } from './eu-common'

const SRC = 'zero-waste-eu'
const LIST = 'https://zerowasteeurope.eu/resources/events/'
const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
}

type Ymd = [number, number, number]

function parseDates(s: string): { start: Ymd; end: Ymd | null } | null {
  const t = s.replace(/\s+/g, ' ').trim()
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: - (\d{1,2})\/(\d{1,2})\/(\d{4}))?$/)
  if (m) return { start: [+m[3], +m[2], +m[1]], end: m[4] ? [+m[6], +m[5], +m[4]] : null }
  m = t.match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))? ([A-Za-z]+) (\d{4})$/)
  if (m && MONTHS[m[3].toLowerCase()]) {
    const mo = MONTHS[m[3].toLowerCase()]
    return { start: [+m[4], mo, +m[1]], end: m[2] ? [+m[4], mo, +m[2]] : null }
  }
  return null
}

function parseTimes(s: string): { h: number; mi: number; eh?: number; emi?: number; cet: boolean } | null {
  const m = s.match(/(\d{1,2})[:.](\d{2})(?:\s*[-–]\s*(\d{1,2})[:.](\d{2}))?/)
  if (!m) return null
  return { h: +m[1], mi: +m[2], eh: m[3] ? +m[3] : undefined, emi: m[4] ? +m[4] : undefined, cet: /\bCES?T\b/i.test(s) }
}

export const zeroWasteEu: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(LIST)
    if (!html) return []
    const $ = cheerio.load(html)
    const events: RawEvent[] = []
    const seen = new Set<string>()

    for (const el of $('a.event-top, a.single-post-card').toArray()) {
      const href = $(el).attr('href')
      if (!href || seen.has(href)) continue
      seen.add(href)
      const type = $(el).find('.event-type')
      if (!type.length || type.hasClass('event-type-online') || /online/i.test(type.text())) continue
      const title = stripHtml($(el).find('h1, h2').first().text())
      const dates = parseDates(stripHtml($(el).find('.event-date').first().text()))
      if (!title || !dates) continue
      const last = dates.end ?? dates.start
      if (Date.UTC(last[0], last[1] - 1, last[2], 23) < Date.now()) continue

      // Detail page: place + description
      const detail = await getText(href)
      if (!detail) continue
      const $d = cheerio.load(detail)
      const body = $d('p').toArray().map((p) => stripHtml($d(p).text())).filter(Boolean)
      let place = ''
      for (const p of body) {
        const pm = p.match(/(?:^|\s)(?:Location|Venue|Where|Place)\s*:\s*([^:]{3,140}?)(?=\s+[A-Z][A-Za-z ]{1,20}:|$)/)
        if (pm) { place = pm[1].trim(); break }
      }
      if (!place || /^online\b/i.test(place)) continue
      const parts = place.split(',').map((x) => x.trim()).filter(Boolean)
      let geo = await geocodeEu(place)
      if (!geo && parts.length > 2) geo = await geocodeEu(parts.slice(-2).join(', '))
      // "Copenhagen and Aarhus" (multi-city tours): anchor on the first place
      if (!geo && /\s(?:and|&)\s|\//.test(place)) geo = await geocodeEu(place.split(/\s(?:and|&)\s|\//)[0].trim())
      if (!geo) continue

      const times = parseTimes(stripHtml($(el).find('.event-time').first().text()))
      const tz = times?.cet ? 'Europe/Brussels' : (CC_TZ[geo.cc ?? ''] ?? 'Europe/Brussels')
      const [y, mo, d] = dates.start
      const starts = times ? zonedIso(tz, y, mo, d, times.h, times.mi) : zonedIso(tz, y, mo, d, 10, 0)
      if (!starts) continue
      let ends: string | null = null
      if (dates.end) ends = zonedIso(tz, dates.end[0], dates.end[1], dates.end[2], times?.eh ?? 18, times?.emi ?? 0)
      else if (times?.eh !== undefined) ends = zonedIso(tz, y, mo, d, times.eh, times.emi ?? 0)
      if (ends && ends <= starts) ends = null

      const description = body.filter((p) => p.length > 40 && !/cookie|newsletter|subscribe/i.test(p)).join(' ').slice(0, 500)
      events.push({
        source: SRC,
        source_id: `zwe-${hashStr(href)}`,
        source_url: href,
        title,
        description: description || `${title} — Zero Waste Europe event in ${place}.`,
        organizer: 'Zero Waste Europe',
        location_name: place,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: starts,
        ends_at: ends,
        cost: 'See event page',
        image_url: $(el).find('img').first().attr('src') ?? null,
      })
    }
    return events
  },
}
