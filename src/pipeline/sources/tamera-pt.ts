/**
 * Tamera — tamera.org/event-calendar — peace research & healing biotope,
 * Relíquias, Odemira (Alentejo). Seminars, hands-on garden/solar weeks,
 * open afternoons.
 *
 * The calendar is server-rendered, one block per month:
 *   <div id='month-October-2026' class='calendar-month'> …
 *     <div class='calendar-event noprereq seminar'>
 *       <div class='event-date'>07 Oct - 13 Oct:</div>
 *       <div class='event-title'><a href='/learn/…'>Title</a></div>
 * The month block gives the year; ongoing and online items are skipped.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const URL_CAL = 'https://www.tamera.org/event-calendar/'
const BASE = 'https://www.tamera.org'
const SRC = 'tamera-pt'
const ORG = 'Tamera'
const LAT = 37.716
const LNG = -8.517

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function dayMonth(s: string): { d: number; m: number } | null {
  const x = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})/)
  if (!x) return null
  const m = MONTHS[x[2].toLowerCase()]
  return m === undefined ? null : { d: parseInt(x[1], 10), m }
}

/** Dates are listed under a month heading; one far from that month belongs to the next/previous year. */
function toDate(dm: { d: number; m: number }, blockYear: number, blockMonth: number): Date {
  const year = dm.m > blockMonth + 6 ? blockYear - 1 : dm.m < blockMonth - 6 ? blockYear + 1 : blockYear
  return new Date(Date.UTC(year, dm.m, dm.d, 9))
}

export const tameraPt: SourceFetcher = {
  name: SRC,
  async fetch() {
    let html: string
    try {
      const res = await fetch(URL_CAL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) return []
      html = await res.text()
    } catch {
      return []
    }

    const now = Date.now()
    const seen = new Set<string>()
    const events: RawEvent[] = []
    const monthRe = /<div id='month-([A-Za-z]+)-(\d{4})' class='calendar-month'>([\s\S]*?)<!--<\/monthdiv/g
    let mb
    while ((mb = monthRe.exec(html)) !== null) {
      const blockMonth = MONTHS[mb[1].slice(0, 3).toLowerCase()]
      const blockYear = parseInt(mb[2], 10)
      if (blockMonth === undefined) continue

      const evRe = /<div class='calendar-event ([^']*)'>\s*<div class='event-date'>([^<]*)<\/div>\s*<div class='event-title'><a href='([^']*)'>([\s\S]*?)<\/a>/g
      let e
      while ((e = evRe.exec(mb[3])) !== null) {
        const [, classes, dateText, href, rawTitle] = e
        const [startText, endText] = dateText.replace(/:\s*$/, '').split(' - ')
        const start = dayMonth(startText ?? '')
        if (!start) continue // "Ongoing:" and similar
        const startDate = toDate(start, blockYear, blockMonth)
        const end = endText ? dayMonth(endText) : null
        const endDate = end ? toDate(end, startDate.getUTCFullYear(), start.m) : null
        if (startDate.getTime() < now) continue

        const title = stripHtml(rawTitle).trim()
        if (/\bonline\b/.test(classes) || /^online/i.test(title)) continue // Emerge is in-person
        const url = href.startsWith('http') ? href : BASE + href
        const key = url + startDate.toISOString()
        if (!title || seen.has(key)) continue
        seen.add(key)

        const kind = /work-?study/.test(classes) ? 'Hands-on / work-study'
          : /dayvisit/.test(classes) ? 'Day visit' : 'Seminar'
        events.push({
          source: SRC,
          source_id: `${SRC}-${hashStr(key)}`,
          source_url: url,
          title,
          description: `${kind} at Tamera, a peace research and healing biotope in the Alentejo working on water retention landscapes, solar technology and community.`,
          organizer: ORG,
          location_name: 'Tamera, Relíquias, Odemira',
          lat: LAT,
          lng: LNG,
          starts_at: startDate.toISOString(),
          ends_at: endDate && endDate >= startDate ? endDate.toISOString() : null,
          cost: 'See event page',
        })
      }
    }
    return events
  },
}
