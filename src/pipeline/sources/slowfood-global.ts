/**
 * Slow Food International — slowfood.com/events/
 * International Slow Food gatherings (Terra Madre regional editions etc.).
 *
 * The /events/ listing is server-rendered: each `.card_events` card has a
 * link, a `<p class="date">` ("20 Nov - 21 Nov 2026", "10 Dec 2026") and a
 * `<p class="location">`. Event detail pages sit behind a Cloudflare JS
 * challenge, so only the listing is read (no bypassing).
 *
 * Italy and Germany are covered by slowfood-it / schnippeldisko-de, so events
 * located there are skipped, as are "Online" and "Worldwide" (Terra Madre
 * Day — a decentralised day of action, not one in-person event).
 * Dates carry no time → 10:00 local in the venue's time zone.
 */
import * as cheerio from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { hashStr, stripHtml } from './utils'
import { getText, geocodeWorld, sleep, tzFor, zonedIso, ONLINE_RE } from './global-net-common'

const SRC = 'slowfood-global'
const BASE = 'https://www.slowfood.com'
const MAX_PAGES = 4
const SKIP_CC = new Set(['it', 'de'])

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** "28 Jul - 01 Aug 2027" | "20 Nov - 21 Nov 2026" | "10 Dec 2026" | "30 Dec 2026 - 02 Jan 2027" */
function parseRange(s: string): { start: [number, number, number]; end: [number, number, number] | null } | null {
  const t = s.replace(/\s+/g, ' ').trim()
  const both = t.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]*(?: (\d{4}))? - (\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/)
  if (both) {
    const em = MONTHS[both[5].toLowerCase()]
    const sm = MONTHS[both[2].toLowerCase()]
    if (!sm || !em) return null
    const ey = +both[6]
    const sy = both[3] ? +both[3] : (sm > em ? ey - 1 : ey)
    return { start: [sy, sm, +both[1]], end: [ey, em, +both[4]] }
  }
  const one = t.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/)
  if (one) {
    const mo = MONTHS[one[2].toLowerCase()]
    if (!mo) return null
    return { start: [+one[3], mo, +one[1]], end: null }
  }
  return null
}

export const slowfoodGlobal: SourceFetcher = {
  name: SRC,
  async fetch() {
    const cards = new Map<string, { title: string; date: string; loc: string; img: string | null }>()
    for (let page = 1; page <= MAX_PAGES; page++) {
      const html = await getText(page === 1 ? `${BASE}/events/` : `${BASE}/events/page/${page}/`)
      if (!html) break
      const $ = cheerio.load(html)
      let added = 0
      $('.card_events').each((_, el) => {
        const c = $(el)
        const href = c.find('a[href*="/events/"]').first().attr('href') ?? ''
        if (!/\/events\/[a-z0-9-]+\/?$/i.test(href) || cards.has(href)) return
        cards.set(href, {
          title: stripHtml(c.find('h3').first().text()),
          date: c.find('p.date').first().text().trim(),
          loc: c.find('p.location').first().text().replace(/\s+/g, ' ').trim(),
          img: c.find('picture img').first().attr('src') ?? null,
        })
        added++
      })
      if (!added) break
      await sleep(1000)
    }

    const now = Date.now()
    const events: RawEvent[] = []
    for (const [url, c] of cards) {
      if (!c.title || !c.loc) continue
      if (/^(online|worldwide|global|everywhere)$/i.test(c.loc) || ONLINE_RE.test(c.title) || ONLINE_RE.test(c.loc)) continue
      const r = parseRange(c.date)
      if (!r) continue

      const geo = await geocodeWorld(c.loc)
      if (!geo || !geo.cc || SKIP_CC.has(geo.cc)) continue
      const tz = tzFor(geo.cc, geo.lat, geo.lng, geo.state)
      if (!tz) continue

      const startsAt = zonedIso(tz, r.start[0], r.start[1], r.start[2], 10, 0)
      if (!startsAt || Date.parse(startsAt) < now + 3600_000) continue
      const endsAt = r.end ? zonedIso(tz, r.end[0], r.end[1], r.end[2], 18, 0) : null

      events.push({
        source: SRC,
        source_id: `sfg-${hashStr(url)}`,
        source_url: url,
        title: c.title,
        description: `${c.title} — an international Slow Food gathering in ${c.loc} (${c.date}), bringing together food communities, farmers, cooks and activists for good, clean and fair food.`,
        organizer: 'Slow Food International',
        location_name: c.loc,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startsAt,
        ends_at: endsAt && Date.parse(endsAt) > Date.parse(startsAt) ? endsAt : null,
        cost: 'See event page',
        image_url: c.img,
      })
    }
    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return events
  },
}
