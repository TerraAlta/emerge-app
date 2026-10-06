/**
 * STOP London — https://www.stoplondon.co.uk — London's school of Theatre of
 * the Oppressed.
 *
 * The site (Hostinger/Zyro builder, no events API or JSON-LD Event) has a
 * handful of course pages, linked from /courses. Each course page states its
 * dates near the top as text, e.g. "30th Nov - 4th Dec 2026" or
 * "11th September 2026". Courses only dated vaguely ("Spring 2027") are
 * skipped. Times aren't published, so starts_at is the start day at 10:00
 * London time. Courses run at Brady Arts and Community Centre, Whitechapel.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'stop-london-uk'
const BASE = 'https://www.stoplondon.co.uk'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
const TIMEOUT = 20000
// Brady Arts and Community Centre, 192-196 Hanbury St, London E1 5HU
const VENUE = { name: 'Brady Arts and Community Centre, 192-196 Hanbury St, London E1 5HU', lat: 51.5207, lng: -0.0683 }
const SKIP = new Set(['', '/', '/about-us', '/contact', '/courses', '/faq', '/resources', '/store', '/privacy-policy', '/stop-london-press-release'])

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

export const stopLondonUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    const coursesHtml = await get(`${BASE}/courses`)
    if (!coursesHtml) return []
    const $ = load(coursesHtml)
    const paths = new Set<string>()
    $('a[href^="/"]').each((_, a) => {
      const href = ($(a).attr('href') ?? '').split(/[?#]/)[0].replace(/\/$/, '')
      if (!SKIP.has(href) && !href.startsWith('/_') && /^\/[a-z0-9-]+$/i.test(href)) paths.add(href)
    })

    const events: RawEvent[] = []
    for (const path of [...paths].slice(0, 12)) {
      const url = `${BASE}${path}`
      const html = await get(url)
      if (!html) continue
      const $p = load(html)
      $p('script, style, nav, header').remove()
      const title = stripHtml($p('h1').first().text()) || stripHtml($p('title').text()).replace(/\s*\|\s*STOP London$/i, '')

      // Text blocks in document order; the date is a short block on its own
      const blocks: string[] = []
      $p('h1, h2, h3, h4, h5, h6, p').each((_, el) => {
        const t = stripHtml($p(el).text())
        if (t) blocks.push(t)
      })
      let range: { start: Date; end: Date | null } | null = null
      for (const b of blocks) {
        if (b.length > 60) continue
        range = parseRange(b)
        if (range) break
      }
      if (!range || !title) continue

      const description = blocks.filter(b => b.length > 60).slice(0, 3).join(' ').slice(0, 500)
      const venueMentioned = /brady/i.test(blocks.join(' '))
      events.push({
        source: SRC,
        source_id: `stop-${hashStr(path + range.start.toISOString())}`,
        source_url: url,
        title,
        description,
        organizer: 'STOP London',
        location_name: venueMentioned ? VENUE.name : 'East London (venue on event page)',
        lat: VENUE.lat,
        lng: VENUE.lng,
        starts_at: range.start.toISOString(),
        ends_at: range.end ? range.end.toISOString() : null,
        cost: 'See event page',
        image_url: $p('meta[property="og:image"]').attr('content') ?? null,
      })
    }
    return events
  },
}

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT),
    })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

/**
 * "30th Nov - 4th Dec 2026", "11th September 2026", "3rd - 5th March 2027",
 * "12th October 2026 - 2nd Jan 2027". Returns null for anything vaguer.
 */
function parseRange(text: string): { start: Date; end: Date | null } | null {
  const t = text.replace(/[–—]/g, '-').trim()
  const DAY = '(\\d{1,2})(?:st|nd|rd|th)?'
  const MON = '([A-Za-z]{3,9})'
  const YR = '(20\\d{2})'
  // d [Mon] [yyyy] - d Mon yyyy
  let m = t.match(new RegExp(`^${DAY}(?:\\s+${MON})?(?:\\s+${YR})?\\s*-\\s*${DAY}\\s+${MON}\\s+${YR}$`))
  if (m) {
    const [, d1, mo1, y1, d2, mo2, y2] = m
    const endMon = MONTHS[mo2.slice(0, 4).toLowerCase()] ?? MONTHS[mo2.slice(0, 3).toLowerCase()]
    const startMon = mo1 ? (MONTHS[mo1.slice(0, 4).toLowerCase()] ?? MONTHS[mo1.slice(0, 3).toLowerCase()]) : endMon
    if (!startMon || !endMon) return null
    let startYear = y1 ? +y1 : +y2
    if (!y1 && startMon > endMon) startYear -= 1
    const start = london(startYear, startMon, +d1, 10)
    const end = london(+y2, endMon, +d2, 17)
    return start ? { start, end } : null
  }
  // d Mon yyyy
  m = t.match(new RegExp(`^${DAY}\\s+${MON}\\s+${YR}$`))
  if (m) {
    const mon = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (!mon) return null
    const start = london(+m[3], mon, +m[1], 10)
    return start ? { start, end: london(+m[3], mon, +m[1], 17) } : null
  }
  return null
}

/** Wall-clock time in London (BST approximated as April–October). */
function london(y: number, mo: number, d: number, hour: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const bst = mo >= 4 && mo <= 10
  const dt = new Date(Date.UTC(y, mo - 1, d, hour - (bst ? 1 : 0)))
  return isNaN(dt.getTime()) || dt.getUTCDate() !== d ? null : dt
}
