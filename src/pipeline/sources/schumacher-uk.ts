/**
 * Schumacher College — schumachercollege.org
 * Ecological education centre in South Devon (now run with the Satish Kumar
 * Foundation). Short residential courses on ecology, craft and leadership.
 *
 * The site is Squarespace but courses are hand-built page blocks, not an
 * events collection, so ?format=json has no dates. We read /courses: each
 * card is one .sqs-html-content block —
 *   "Short Course / In-Person - Creative Cultures" | <h4>TITLE</h4> | subtitle
 *   | "5 days" | "7th - 11th Oct 2026" | "From £ 525"
 * followed by a "Learn More" link. Only In-Person cards with a day-precise
 * date range are kept (Online is skipped; Hybrid long courses only give
 * months). The course page is fetched for the venue paragraph and the start
 * time ("Wednesday 7th (start 14:00) - ...").
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'schumacher-uk'
const BASE = 'https://www.schumachercollege.org'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
// Courses run at Schumacher's home bioregion around Dartington / Totnes
const DEFAULT_LAT = 50.4520
const DEFAULT_LNG = -3.7020
const MAX_DETAIL = 15

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function londonOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

function londonIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - londonOffsetMin(guess) * 60000).toISOString()
}

const ORD = '(?:st|nd|rd|th)?'
/**
 * "7th - 11th Oct 2026", "16th - 18th Oct 2026", "30th Oct - 2nd Nov 2026",
 * "15 Mar 2027". Returns null for month-only ranges ("Sept 2026 - April 2027").
 */
function parseRange(s: string): { start: [number, number, number]; end: [number, number, number] } | null {
  const r = s.match(new RegExp(`(\\d{1,2})${ORD}\\s*([A-Za-z]{3,})?\\s*[-–—]\\s*(\\d{1,2})${ORD}\\s+([A-Za-z]{3,})\\s+(\\d{4})`))
  if (r) {
    const endMo = MONTHS[r[4].slice(0, 3).toLowerCase()]
    const startMo = r[2] ? MONTHS[r[2].slice(0, 3).toLowerCase()] : endMo
    if (!endMo || !startMo) return null
    const ey = +r[5]
    const sy = startMo > endMo ? ey - 1 : ey
    return { start: [sy, startMo, +r[1]], end: [ey, endMo, +r[3]] }
  }
  const one = s.match(new RegExp(`(\\d{1,2})${ORD}\\s+([A-Za-z]{3,})\\s+(\\d{4})`))
  if (one) {
    const mo = MONTHS[one[2].slice(0, 3).toLowerCase()]
    if (!mo) return null
    const d: [number, number, number] = [+one[3], mo, +one[1]]
    return { start: d, end: d }
  }
  return null
}

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])
/** "THE ART OF KINCENTRIC LEADERSHIP" → "The Art of Kincentric Leadership" */
function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s
  return s.toLowerCase().split(' ').map((w, i) =>
    i > 0 && SMALL.has(w) ? w : w.replace(/^(\W*)(\w)/, (_m, p: string, c: string) => p + c.toUpperCase()),
  ).join(' ')
}

export const schumacherUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await get(`${BASE}/courses`)
    if (!html) {
      console.warn(`[${SRC}] /courses fetch failed`)
      return []
    }
    const $ = load(html)

    interface Card { title: string; subtitle: string; text: string; url: string; price: string }
    const cards: Card[] = []
    const blocks = $('.sqs-html-content').toArray()
    for (const b of blocks) {
      const el = $(b)
      const paras = el.find('p, h1, h2, h3, h4').toArray()
        .map((p) => $(p).text().replace(/\s+/g, ' ').trim()).filter(Boolean)
      const full = paras.join(' | ')
      if (/^Past Courses/i.test(full)) break // everything after this heading is past
      const kind = el.find('p').first().text().trim()
      if (!/Course\s*\/\s*In-Person/i.test(kind)) continue
      const title = stripHtml(el.find('h4').first().text())
      if (!title) continue
      // The "Learn More" button lives in the next block
      const link = $(b).closest('.fe-block').nextAll('.fe-block').find('a[href]').first().attr('href')
        ?? el.parent().nextAll().find('a[href]').first().attr('href')
      const price = paras.find((p) => /£/.test(p)) ?? ''
      const subtitle = paras.find((p) => p !== kind && p.toUpperCase() !== title.toUpperCase() && !/£|^\d+\s+(days?|weeks?)/i.test(p) && !parseRange(p)) ?? ''
      cards.push({
        title, subtitle, text: full, price,
        url: link ? new URL(link, BASE).toString() : `${BASE}/courses`,
      })
    }

    const events: RawEvent[] = []
    let detailCount = 0
    for (const c of cards) {
      const range = parseRange(c.text.split(' | ').filter((p) => !/£/.test(p)).join(' | '))
      if (!range) continue
      const [y, mo, d] = range.start
      // Skip courses already finished before spending a request
      if (Date.UTC(range.end[0], range.end[1] - 1, range.end[2]) < Date.now() - 864e5) continue

      let venue = ''
      let startH = 10
      let startM = 0
      let lat = DEFAULT_LAT
      let lng = DEFAULT_LNG
      if (c.url !== `${BASE}/courses` && c.url.startsWith(BASE) && detailCount < MAX_DETAIL) {
        detailCount++
        const dh = await get(c.url)
        if (dh) {
          const $d = load(dh)
          $d('script, style, noscript').remove()
          const text = $d('body').text().replace(/\s+/g, ' ')
          const v = text.match(/Venue\s+(.{10,200}?\.)/)
          if (v) venue = v[1].trim()
          const st = text.match(/\(\s*start\s+(\d{1,2})[:.](\d{2})\s*\)/i)
          if (st) { startH = +st[1]; startM = +st[2] }
        }
      }
      // A course hosted far from Devon (e.g. a London partner venue) would get
      // the wrong pin — skip rather than misplace it.
      if (venue && /\b(London|Japan|Estonia|online)\b/i.test(venue) && !/Devon|Dartington|Totnes|Rill/i.test(venue)) continue

      const startsAt = londonIso(y, mo, d, startH, startM)
      const endsAt = londonIso(range.end[0], range.end[1], range.end[2], 14, 0)
      events.push({
        source: SRC,
        source_id: `sc-${hashStr(c.title + range.start.join('-'))}`,
        source_url: c.url,
        title: titleCase(c.title),
        description: [c.subtitle, venue].filter(Boolean).join(' — ').slice(0, 500)
          || 'Schumacher College short course on ecology, craft and transformation.',
        organizer: 'Schumacher College',
        location_name: /Rill Estate/i.test(venue) ? 'Rill Estate, South Devon' : 'Schumacher College, South Devon',
        lat, lng,
        starts_at: startsAt,
        ends_at: endsAt > startsAt ? endsAt : null,
        cost: c.price.replace(/\s+/g, ' ').replace(/£\s+/g, '£') || 'See course page',
      })
    }
    return events
  },
}
