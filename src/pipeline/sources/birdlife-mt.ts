/**
 * BirdLife Malta — public outings, nature walks and workshops
 * (https://birdlifemalta.org/events/).
 *
 * The site has no events plugin (its /wp-json/tribe route is blocked anyway).
 * The Events page lists the current events as posts ("Pages Overview" cards
 * with a "Read More" link); each post opens with a fixed block:
 *   "Date : Sunday, 25 October, 2026  Location : Marfa Jetty Pier
 *    Time : 7:00-14:00"
 * (the year is sometimes left out — we take the first such date on or after
 * the post's publication). Times are Europe/Malta; without a time an event
 * starts at 10:00. Venues: BirdLife reserves and common meeting points are
 * mapped to fixed coordinates, anything else is geocoded within Malta, and
 * an event that can't be placed is skipped.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, zonedIso, enMonth, parseTimeRange, geocodeFirst, ONLINE_RE, type LatLng } from './misc-common'

const SRC = 'birdlife-mt'
const PAGE = 'https://birdlifemalta.org/events/'
const TZ = 'Europe/Malta'
const MAX_DETAIL = 20

const PLACES: Array<[RegExp, LatLng]> = [
  [/salina/i, { lat: 35.94606, lng: 14.42296 }],
  [/g[ħh]adira/i, { lat: 35.97088, lng: 14.34888 }],
  [/simar/i, { lat: 35.94573, lng: 14.38064 }],
  [/buskett/i, { lat: 35.85882, lng: 14.39797 }],
  [/[ħh]a[ġg]ar qim|mnajdra/i, { lat: 35.8272, lng: 14.44353 }],
  [/marfa/i, { lat: 35.9893, lng: 14.3575 }], // Marfa jetty (Comino boats)
]

function blockField(text: string, label: string): string {
  const re = new RegExp(`${label}\\s*:\\s*(.+?)(?=\\s+(?:Date|Location|Venue|Meeting point|Time|Price|Cost|Spots|Age)\\s*:|\\s*🎟|\\s{2,}|$)`, 'i')
  return text.match(re)?.[1]?.trim() ?? ''
}

export const birdlifeMt: SourceFetcher = {
  name: SRC,
  async fetch() {
    const list = await getText(PAGE)
    if (!list) return []
    const links = [...new Set([...list.matchAll(/<a class="view-article" href="(https:\/\/birdlifemalta\.org\/\d{4}\/\d{2}\/[^"]+)"/g)].map((m) => m[1]))]
    const now = Date.now()
    const out: RawEvent[] = []

    for (const url of links.slice(0, MAX_DETAIL)) {
      const html = await getText(url)
      if (!html) continue
      const title = stripHtml(html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '')
        .replace(/\s*[:|-]\s*BirdLife Malta\s*$/i, '')
      const published = html.match(/<meta property="article:published_time" content="([^"]+)"/)?.[1]
      const text = stripHtml(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|h\d|li)>|<br\s*\/?>/gi, '  '))
      const t0 = text.search(/Date\s*:/)
      if (!title || t0 < 0) continue
      const body = text.slice(t0)

      const dateTxt = blockField(body, 'Date')
      const dm = dateTxt.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s*(\d{4})?/)
      const mo = enMonth(dm?.[2])
      if (!dm || !mo) continue
      let year = dm[3] ? +dm[3] : NaN
      if (!dm[3]) {
        const pub = published ? new Date(published) : null
        if (!pub || isNaN(+pub)) continue
        year = pub.getUTCFullYear()
        if (Date.UTC(year, mo - 1, +dm[1]) < Date.UTC(pub.getUTCFullYear(), pub.getUTCMonth(), pub.getUTCDate())) year++
      }
      const [st, en] = parseTimeRange(blockField(body, 'Time'))
      const start = zonedIso(TZ, year, mo, +dm[1], st?.[0] ?? 10, st?.[1] ?? 0)
      if (!start || Date.parse(start) < now + 3600_000) continue
      let end = en ? zonedIso(TZ, year, mo, +dm[1], en[0], en[1]) : null
      if (end && end <= start) end = null

      const location = blockField(body, 'Location') || blockField(body, 'Venue') || blockField(body, 'Meeting point')
      if (ONLINE_RE.test(location)) continue
      let geo: LatLng | null = PLACES.find(([re]) => re.test(location))?.[1] ?? null
      if (!geo && location) geo = await geocodeFirst([location, location.split(',')[0]], 'mt')
      if (!geo) continue

      const price = blockField(body, 'Price') || (body.match(/€\s?\d+[^🎟]{0,40}/)?.[0] ?? '')
      const slug = url.replace(/\/$/, '').split('/').pop()
      out.push({
        source: SRC,
        source_id: `blm-${slug}-${start.slice(0, 10)}`,
        source_url: url,
        title,
        description: body.replace(/\s+/g, ' ').slice(0, 500),
        organizer: 'BirdLife Malta',
        location_name: `${location}, Malta`,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: start,
        ends_at: end,
        cost: /free/i.test(price) ? 'Free' : price ? price.trim().slice(0, 60) : 'See event page',
      })
    }
    return out
  },
}
