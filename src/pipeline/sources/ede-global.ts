/**
 * EDE Global — Gaia Education — gaiaeducation.org
 * Face-to-face Ecovillage Design Education (EDE), mini-EDE, Training of
 * Trainers and workshops hosted at ecovillages worldwide.
 *
 * Listing (Simplero shop): https://www.gaiaeducation.org/face2face-courses
 *   <div class="product-card …"> <h3 itemprop="name">EDE – Bali, Indonesia 2026</h3>
 *     <h4 class="product-card__subtitle">Nov 2nd to Nov 27th</h4>   (free text)
 * Each course page has an overview block:
 *   "Type: Face to Face  Date: Nov 2nd - 27th 2026  Where: Dune Alaya Ecolodge"
 *   or "Start Date: Jan 24th 2027  End Date: Feb 14th 2027 … Location: Kisantu…"
 * Dates are free text in many shapes ("10th January 2027", "7, 8, 14 e 15/Nov,
 * 2026", "Jan 7th - Feb 11h 2027"); entries with only a month or "TBC" are
 * skipped. Year comes from the text, else from the course title. Times are
 * rarely given → 10:00 local in the venue's time zone (from the geocoded
 * country). Venue: "Where/Location" field, else the place named in the title.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities } from './utils'
import { getText, geocodeWorldFirst, tzFor, zonedIso, MONTHS, countryCodeFromName } from './global-common'

const SRC = 'ede-global'
const BASE = 'https://www.gaiaeducation.org'
const LIST = `${BASE}/face2face-courses`
const MAX_DETAILS = 20

const MON = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const ORD = '(?:st|nd|rd|th|h)?'
const monthNum = (s: string) => MONTHS[s.toLowerCase().replace(/\.$/, '')] ?? MONTHS[s.toLowerCase().slice(0, 3)]

interface Ymd { y: number; m: number; d: number }
interface Range { start: Ymd; end?: Ymd; h: number; mi: number }

/** Parse a free-text date / range. Returns null if there is no day-precise start date. */
export function parseLooseRange(raw: string, fallbackYear?: number): Range | null {
  const s = raw.replace(/\s+/g, ' ')
  const years = [...s.matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1])
  const startYear = years[0] ?? fallbackYear
  if (!startYear) return null
  const t = s.replace(/\b20\d{2}\b/g, ' ')

  const pats: { re: RegExp; dm: (m: RegExpExecArray) => [number, number] }[] = [
    { re: new RegExp(`\\b(${MON})\\.?\\s+(\\d{1,2})${ORD}\\b`, 'i'), dm: (m) => [+m[2], monthNum(m[1])] },
    { re: new RegExp(`\\b(\\d{1,2})${ORD},?\\s+(?:of\\s+)?(${MON})\\b`, 'i'), dm: (m) => [+m[1], monthNum(m[2])] },
    { re: new RegExp(`\\b(\\d{1,2})[\\d,\\s&e]*\\/\\s*(${MON})\\b`, 'i'), dm: (m) => [+m[1], monthNum(m[2])] },
  ]
  let best: { idx: number; len: number; d: number; m: number } | null = null
  for (const p of pats) {
    const m = p.re.exec(t)
    if (m && (!best || m.index < best.idx)) {
      const [d, mo] = p.dm(m)
      if (mo && d >= 1 && d <= 31) best = { idx: m.index, len: m[0].length, d, m: mo }
    }
  }
  if (!best) return null
  const start: Ymd = { y: startYear, m: best.m, d: best.d }

  let end: Ymd | undefined
  const rest = t.slice(best.idx + best.len)
  let em: RegExpExecArray | null = null
  for (const p of pats.slice(0, 2)) {
    const m = p.re.exec(rest)
    if (m && (!em || m.index < em.index)) em = m
  }
  if (em) {
    const [d, mo] = new RegExp(`^(${MON})`, 'i').test(em[0]) ? [+em[2], monthNum(em[1])] : [+em[1], monthNum(em[2])]
    if (mo) end = { y: years.length > 1 ? years[years.length - 1] : startYear, m: mo, d }
  } else {
    const sm = /^\s*(?:-|–|—|to|until|a|al)\s*(\d{1,2})(?:st|nd|rd|th|h)?\b/i.exec(rest)
    if (sm) end = { y: start.y, m: start.m, d: +sm[1] }
  }
  if (end && (end.m < start.m || (end.m === start.m && end.d < start.d)) && end.y === start.y) end.y++

  let h = 10, mi = 0
  const tm = /\b(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)\b/i.exec(t)
  if (tm) {
    h = (+tm[1] % 12) + (tm[3].toLowerCase() === 'pm' ? 12 : 0)
    mi = tm[2] ? +tm[2] : 0
  }
  return { start, end, h, mi }
}

/** "EDE – Bali, Indonesia 2026" → "Bali, Indonesia" */
function placeFromTitle(title: string): string {
  return title
    .replace(/\b(mini[- ]?EDEs?|EDE|ToT|TOT|PDC)\b/g, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/Unversit[ée]|Universit[ée]/gi, ' ')
    .replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function overviewField(text: string, label: string): string {
  const m = text.match(new RegExp(`\\b${label}:\\s*(.+?)\\s+(?:Type|Date|Start Date|End Date|Where|Location|Website|Contact|Language|Certified by|Hosted by|Price|Duration):`, 'i'))
  return m ? m[1].trim() : ''
}

export const edeGlobal: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(LIST)
    if (!html) return []
    const now = Date.now()
    const events: RawEvent[] = []
    let details = 0

    for (const block of html.split('class="product-card grid__item').slice(1)) {
      const href = block.match(/href="([^"]+)"/)?.[1]
      const title = decodeEntities(block.match(/itemprop="name">([^<]*)</)?.[1] ?? '').trim()
      const subtitle = stripHtml(block.match(/product-card__subtitle">([\s\S]*?)<\/h4>/)?.[1] ?? '')
      if (!href || !title) continue
      if (/\b(online|webinar)\b/i.test(title)) continue
      const titleYear = +(title.match(/\b(20\d{2})\b/)?.[1] ?? 0) || undefined

      // Quick pre-check from the card (skip "Dates TBC", month-only, past)
      const cardRange = parseLooseRange(subtitle, titleYear)
      if (/\bTBC\b|\bTBA\b/i.test(subtitle) && !cardRange) continue
      if (cardRange && Date.UTC(cardRange.start.y, cardRange.start.m - 1, cardRange.start.d) < now - 86400_000) continue
      if (!cardRange) continue

      let range = cardRange
      let where = ''
      let desc = ''
      let host = ''
      if (details < MAX_DETAILS) {
        details++
        const page = await getText(href)
        if (page) {
          const text = stripHtml(page.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' '))
          const type = overviewField(text, 'Type')
          if (type && !/face/i.test(type)) continue
          const dateTxt = overviewField(text, 'Start Date') || overviewField(text, 'Date')
          const endTxt = overviewField(text, 'End Date')
          const r = parseLooseRange(`${dateTxt}${endTxt ? ` - ${endTxt}` : ''}`, titleYear ?? cardRange.start.y)
          if (r) range = r
          where = overviewField(text, 'Where') || overviewField(text, 'Location')
          where = where.replace(/\S+@\S+|https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
          desc = decodeEntities(page.match(/<meta[^>]+(?:name|property)="(?:og:)?description"[^>]+content="([^"]*)"/)?.[1] ?? '').trim()
          host = overviewField(text, 'Hosted by')
        }
      }

      const place = placeFromTitle(title)
      // Most specific first; never settle for a bare country (centroid ≠ venue)
      const afterColon = where.includes(':') ? where.split(':').pop()!.trim() : ''
      const firstPart = where.split(/[,:]/)[0].trim()
      const queries = [where, afterColon, firstPart && place ? `${firstPart}, ${place}` : '', firstPart, place]
        .filter((q) => q && !countryCodeFromName(q.split(',')[0]))
      const geo = await geocodeWorldFirst(queries)
      if (!geo) continue
      const tz = tzFor(geo.cc, geo.lat, geo.lng, geo.state)
      const startIso = zonedIso(range.start.y, range.start.m, range.start.d, range.h, range.mi, tz)
      if (!startIso || Date.parse(startIso) < now + 3600_000) continue
      const endIso = range.end ? zonedIso(range.end.y, range.end.m, range.end.d, 17, 0, tz) : null

      const kind = /mini[- ]?EDE/i.test(title) ? 'mini-EDE (short Ecovillage Design Education course)'
        : /\bEDE\b/.test(title) ? 'Ecovillage Design Education (EDE) — Gaia Education\'s flagship course on the social, ecological, economic and worldview dimensions of regenerative community design'
        : /\bToT\b/i.test(title) ? 'Training of Trainers for Gaia Education / ecovillage educators'
        : 'Gaia Education face-to-face programme'
      events.push({
        source: SRC,
        source_id: `ede-${href.replace(/^https?:\/\/[^/]+\//, '').slice(0, 80)}-${startIso.slice(0, 10)}`,
        source_url: href,
        title,
        description: [desc, `${kind}.`, where ? `Venue: ${where}.` : '', `Dates: ${subtitle}.`].filter(Boolean).join(' ').slice(0, 1000),
        organizer: host && host.length < 80 ? `${host} with Gaia Education` : 'Gaia Education',
        location_name: where && where.toLowerCase().includes(place.toLowerCase()) ? where : [where, place].filter(Boolean).join(', '),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startIso,
        ends_at: endIso && Date.parse(endIso) > Date.parse(startIso) ? endIso : null,
        cost: 'See course page',
      })
    }
    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return events
  },
}
