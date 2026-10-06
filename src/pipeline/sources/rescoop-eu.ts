/**
 * REScoop.eu — European federation of renewable energy cooperatives.
 *
 * Events are listed at /news-and-events/events as cards:
 *   <article class="article-card news-item news-item-events">
 *     <h2><a href="…/events/forum-general-meeting-2026">European Energy Communities Forum…</a></h2>
 *     <footer><h3><a …>5 - 7 May, 2026 - Latvia and online</a></h3></footer>
 * i.e. "<day>[ <month>][ - <day> <month>], <year> - <place>". Most entries
 * are webinars ("Online"); the in-person ones (annual Energy Communities
 * Forum + AGM, Brussels policy events, EUSEW) are a few a year. Online-only
 * cards are skipped, "X and online" keeps X. No times on the cards, so the
 * start is 10:00 local at the venue (zone from the geocoded country). For
 * upcoming in-person events the detail page supplies a description.
 */
import * as cheerio from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, geocodeEu, zonedIso, enMonth, CC_TZ } from './eu-common'

const SRC = 'rescoop-eu'
const LIST = 'https://www.rescoop.eu/news-and-events/events'

type Ymd = [number, number, number]

/** "20 Oct, 2026" | "9 - 11 Jun, 2026" | "29 Oct - 2 Nov, 2026" | "30 Dec, 2026 - 2 Jan, 2027" */
function parseRange(s: string): { start: Ymd; end: Ymd | null } | null {
  const t = s.replace(/\s+/g, ' ').trim()
  let m = t.match(/^(\d{1,2}) ([A-Za-z]+),? (\d{4}) - (\d{1,2}) ([A-Za-z]+),? (\d{4})$/)
  if (m) {
    const a = enMonth(m[2]), b = enMonth(m[5])
    return a && b ? { start: [+m[3], a, +m[1]], end: [+m[6], b, +m[4]] } : null
  }
  m = t.match(/^(\d{1,2})(?: ([A-Za-z]+))?(?: - (\d{1,2})(?: ([A-Za-z]+))?)?,? (\d{4})$/)
  if (!m) return null
  const y = +m[5]
  const endMo = enMonth(m[4] ?? m[2] ?? '')
  const startMo = m[2] ? enMonth(m[2]) : endMo
  if (!startMo || !endMo) return null
  // The year belongs to the end date: "29 Dec - 2 Jan, 2027" starts in 2026
  const start: Ymd = [m[3] && startMo > endMo ? y - 1 : y, startMo, +m[1]]
  const end: Ymd | null = m[3] ? [y, endMo, +m[3]] : null
  return { start, end }
}

export const rescoopEu: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(LIST)
    if (!html) return []
    const $ = cheerio.load(html)
    const cutoff = Date.now() - 86400000
    const events: RawEvent[] = []

    for (const el of $('article.news-item-events').toArray()) {
      const a = $(el).find('h2 a').first()
      const title = stripHtml(a.text())
      const href = a.attr('href')
      const meta = stripHtml($(el).find('footer h3').first().text())
      if (!title || !href || !meta) continue

      // Split "<dates> - <place>": the place follows the " - " after the year
      const mm = meta.match(/^(.*?\d{4})\s+-\s+(.+)$/)
      if (!mm) continue
      const range = parseRange(mm[1])
      if (!range) continue
      const place = mm[2].replace(/\s*(?:and|&|\+)\s*online\s*$/i, '').replace(/^online\s*(?:and|&|\+)\s*/i, '').trim()
      if (!place || /^(online|virtual|webinar)$/i.test(place)) continue

      // Rough future check before geocoding (UTC noon of the last day)
      const last = range.end ?? range.start
      if (Date.UTC(last[0], last[1] - 1, last[2], 12) < cutoff) continue

      const parts = place.split(',').map((x) => x.trim()).filter(Boolean)
      let geo = await geocodeEu(place)
      if (!geo && parts.length > 2) geo = await geocodeEu(parts.slice(-2).join(', '))
      if (!geo && parts.length > 1) geo = await geocodeEu(parts[parts.length - 1])
      if (!geo) continue
      const tz = CC_TZ[geo.cc ?? ''] ?? 'Europe/Brussels'
      const starts = zonedIso(tz, range.start[0], range.start[1], range.start[2], 10, 0)
      if (!starts) continue
      const ends = range.end ? zonedIso(tz, range.end[0], range.end[1], range.end[2], 18, 0) : null

      let description = ''
      if (new Date(starts).getTime() > Date.now()) {
        const detail = await getText(href)
        if (detail) {
          const $d = cheerio.load(detail)
          description = $d('main p, .article-body p, article p').toArray()
            .map((p) => stripHtml($d(p).text())).filter((t) => t.length > 30 && !/newsletter/i.test(t))
            .join(' ').slice(0, 500)
        }
      }

      events.push({
        source: SRC,
        source_id: `rescoop-${hashStr(href)}`,
        source_url: href,
        title,
        description: description || `${title} — REScoop.eu event (${meta}).`,
        organizer: 'REScoop.eu',
        location_name: place,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: starts,
        ends_at: ends && ends > starts ? ends : null,
        cost: 'See event page',
      })
    }
    return events
  },
}
