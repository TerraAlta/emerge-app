/**
 * OUR Ecovillage — Shawnigan Lake, Vancouver Island, BC (ourecovillage.org)
 *
 * The site (WordPress/Divi, no events plugin) has no event feed. Its real
 * programme lives on a handful of course pages linked from the main menu
 * ("Intro to Permaculture with Starhawk", "Permaculture Design Program",
 * "reVILLAGEing Family Camp", "2027 Natural Building Summer Program" …) and
 * the "Public Tours" page. Each course page states its dates right under the
 * heading ("INTRODUCTION TO PERMACULTURE July 2-4, 2027", "INTERNSHIP: MAY
 * 31st, – June 27th" with the year in the page title); the tours page lists
 * "Book a Tour - JUNE 6, 2026" lines (tours start 10am, ~2 h).
 *
 * We read the menu, open up to 12 course pages, and emit one event per dated
 * programme (several when a page lists labelled segments). Pages without a
 * parseable date are skipped. Times are America/Vancouver; without a stated
 * start time a course starts at 10:00 local. Location is the ecovillage
 * (1650 Renfrew Rd, Shawnigan Lake).
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, zonedIso, enMonth, parseClock } from './misc-common'

const SRC = 'our-ecovillage-ca'
const BASE = 'https://ourecovillage.org'
const TZ = 'America/Vancouver'
const VENUE = { name: 'OUR Ecovillage, 1650 Renfrew Rd, Shawnigan Lake, BC', lat: 48.6511, lng: -123.6516 }
const MAX_PAGES = 12

const COURSE_RX = /permaculture|program|camp|workshop|course|building|starhawk|retreat|tour|intensive|20\d\d/i
const SKIP_RX = /\/category\/|\/author\/|\/wp-|programs\/?$|sustainer|virtual-tour|wellness|rezoning|colloquium|report|opportunit|booking|policies|history|gallery|media/i
const FALLBACK_PAGES = [
  `${BASE}/our-ecovillage-public-tours/`,
  `${BASE}/intro-to-permaculture-with-starhawk/`,
  `${BASE}/2027-permaculture-design-program/`,
  `${BASE}/our-re-villaging-family-camp/`,
]

const MON = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)'
const ORD = '(?:st|nd|rd|th)?'
const RANGE_RX = new RegExp(`${MON}\\.?\\s+(\\d{1,2})${ORD},?\\s*(?:[-–—]|to)\\s*(?:${MON}\\.?\\s+)?(\\d{1,2})${ORD}(?:,?\\s*(20\\d\\d))?`, 'gi')
const TOUR_RX = new RegExp(`Book a Tour\\s*[-–—]\\s*${MON}\\.?\\s+(\\d{1,2})${ORD},?\\s*(20\\d\\d)`, 'gi')

function pageText(html: string): string {
  const body = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  return stripHtml(body.replace(/<\/(p|div|h\d|li)>/gi, ' '))
}

function titleOf(html: string): string {
  const t = stripHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
  return t.replace(/\s*[-–|]\s*OUR Ecovillage\s*$/i, '').trim()
}

/** Main content: after the menu's "Select Page", before the sidebar "Archives". */
function mainText(text: string): string {
  const i = text.indexOf('Select Page')
  let s = i >= 0 ? text.slice(i + 'Select Page'.length) : text
  const j = s.search(/\bArchives\b|Recent Posts/)
  if (j > 0) s = s.slice(0, j)
  return s.trim()
}

/** "INTRODUCTION TO PERMACULTURE" → "Introduction To Permaculture"; mixed-case words kept. */
function smartCase(s: string): string {
  return s.replace(/\b[A-Z][A-Z'’\-]+\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase()).replace(/\s+/g, ' ').trim()
}

function mk(
  slug: string, url: string, title: string, desc: string, start: string, end: string | null,
): RawEvent {
  return {
    source: SRC,
    source_id: `oev-${slug}-${start.slice(0, 10)}`,
    source_url: url,
    title,
    description: desc.slice(0, 500),
    organizer: 'OUR Ecovillage',
    location_name: VENUE.name,
    lat: VENUE.lat,
    lng: VENUE.lng,
    starts_at: start,
    ends_at: end,
    cost: 'See event page',
  }
}

function parsePage(url: string, html: string): RawEvent[] {
  const slug = url.replace(/\/$/, '').split('/').pop() || 'page'
  const pageTitle = titleOf(html)
  const main = mainText(pageText(html))
  if (!main) return []
  const out: RawEvent[] = []

  // Public tours: "Book a Tour - JUNE 6, 2026" — 10am, about 2 hours.
  for (const m of main.matchAll(TOUR_RX)) {
    const mo = enMonth(m[1])
    if (!mo) continue
    const start = zonedIso(TZ, +m[3], mo, +m[2], 10, 0)
    const end = zonedIso(TZ, +m[3], mo, +m[2], 12, 0)
    if (start) {
      out.push(mk(`tour`, url, 'Guided Public Tour of OUR Ecovillage', 'One-hour educational presentation followed by a one-hour guided walk of the ecovillage (permaculture farm, natural buildings). Rain or shine; booking required.', start, end))
    }
  }
  if (out.length) return out

  // Course pages: the <h1> names the programme; the next headings carry the
  // dates, optionally labelled ("INTERNSHIP: MAY 31st, – June 27th").
  const heads: string[] = []
  for (const m of html.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const t = stripHtml(m[2])
    if (!t) continue
    if (/^(Archives|Categories|Recent Posts|Land acknowledg)/i.test(t)) break
    heads.push(t)
  }
  const h1 = heads.find((h) => !h.match(RANGE_RX))
  if (!h1) return out
  const name = smartCase(h1)
  const titleYear = h1.match(/\b(20\d\d)\b/)?.[1] ?? pageTitle.match(/\b(20\d\d)\b/)?.[1] ?? url.match(/\b(20\d\d)\b/)?.[1]
  const startClock = main.match(/\b(?:begin|arrive(?:\s+before)?|starts?(?:\s+at)?)\s*:?\s*(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)/i)?.[1]
  const [sh, sm] = (startClock && parseClock(startClock)) || [10, 0]
  const desc = main.slice(0, 900).replace(/\s+/g, ' ')
  const dated = heads.slice(heads.indexOf(h1) + 1, heads.indexOf(h1) + 7)
    .map((h) => ({ h, m: [...h.matchAll(RANGE_RX)][0] }))
    .filter((x) => x.m)
  for (const { h, m } of dated) {
    const mo1 = enMonth(m[1])
    const mo2 = m[3] ? enMonth(m[3]) : mo1
    const year = m[5] ?? titleYear
    if (!mo1 || !mo2 || !year) continue
    const start = zonedIso(TZ, +year, mo1, +m[2], sh, sm)
    let end = zonedIso(TZ, +year, mo2, +m[4], 17, 0)
    if (!start) continue
    if (end && end <= start) end = null
    const label = h.slice(0, m.index).replace(/[\s:–-]+$/, '').trim()
    const title = dated.length > 1 && label ? `${name} — ${smartCase(label)}` : name
    const key = dated.length > 1 && label ? `${slug}-${label.toLowerCase().replace(/[^a-z]+/g, '-')}` : slug
    out.push(mk(key, url, title, desc, start, end))
  }
  return out
}

export const ourEcovillageCa: SourceFetcher = {
  name: SRC,
  async fetch() {
    const home = await getText(`${BASE}/`)
    let pages: string[] = []
    if (home) {
      const seen = new Set<string>()
      for (const m of home.matchAll(/href="(https:\/\/ourecovillage\.org\/[^"#?]+)"/g)) {
        const u = m[1].endsWith('/') ? m[1] : `${m[1]}/`
        if (seen.has(u) || SKIP_RX.test(u) || !COURSE_RX.test(u.slice(BASE.length))) continue
        seen.add(u)
        pages.push(u)
      }
    }
    if (!pages.length) pages = FALLBACK_PAGES

    const now = Date.now()
    const out = new Map<string, RawEvent>()
    for (const url of pages.slice(0, MAX_PAGES)) {
      const html = await getText(url)
      if (!html) continue
      for (const e of parsePage(url, html)) {
        if (Date.parse(e.starts_at) < now + 3600_000) continue
        if (!out.has(e.source_id)) out.set(e.source_id, e)
      }
    }
    return [...out.values()].slice(0, 200)
  },
}
