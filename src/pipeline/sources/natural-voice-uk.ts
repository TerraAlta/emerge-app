/**
 * Natural Voice Network — naturalvoice.net — community singing workshops,
 * song circles, singing weekends across the UK.
 *
 * The site (custom WordPress theme, no Events Calendar / JSON-LD events) lists
 * 12 event cards per page at /events/page/N/, sorted by start date. Each card
 * has a date span ("07 Oct 2026—11 Oct 2026") and a time ("7.15pm—9pm" or
 * "Residential"). The event page adds the address, cost and map coordinates
 * (data-lat / data-lng on the map div).
 *
 * Online events (Zoom etc.) are skipped. Events without a parseable date or
 * coordinates are skipped — never stamped with "now" or a default location.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'natural-voice-uk'
const BASE = 'https://www.naturalvoice.net'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
const LIST_PAGES = 3      // 36 cards ≈ the next 4–5 weeks
const MAX_DETAILS = 20    // keeps the run at ≤ 24 requests

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}
const ONLINE_RX = /\b(online|zoom|virtual|webinar)\b/i

async function get(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) })
    return r.ok ? await r.text() : null
  } catch { return null }
}

/** Last Sunday of a month, as a UTC day number. */
function lastSunday(y: number, m: number): number {
  const d = new Date(Date.UTC(y, m + 1, 0))
  return d.getUTCDate() - d.getUTCDay()
}

/** UK wall-clock time → ISO string (BST: last Sun Mar 01:00 UTC → last Sun Oct 01:00 UTC). */
function londonIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const asUtc = Date.UTC(y, mo, d, h, mi)
  const bstStart = Date.UTC(y, 2, lastSunday(y, 2), 1)
  const bstEnd = Date.UTC(y, 9, lastSunday(y, 9), 1)
  const offset = asUtc - 3600000 >= bstStart && asUtc - 3600000 < bstEnd ? 1 : 0
  return new Date(asUtc - offset * 3600000).toISOString()
}

/** "07 Oct 2026" → [y, m, d] */
function parseDay(s: string): [number, number, number] | null {
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/)
  if (!m) return null
  const mo = MONTHS[m[2].toLowerCase()]
  return mo === undefined ? null : [parseInt(m[3]), mo, parseInt(m[1])]
}

/** "7.15pm", "10.00", "10.30am", "2pm", "18.00" → [h, m] */
function parseTime(s: string): [number, number] | null {
  const m = s.trim().match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?/i)
  if (!m) return null
  let h = parseInt(m[1])
  const mi = m[2] ? parseInt(m[2]) : 0
  const ap = m[3]?.toLowerCase()
  if (!ap && !m[2]) return null // a bare number isn't a time
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h > 23 || mi > 59) return null
  return [h, mi]
}

interface Card { url: string; title: string; dates: string; times: string; excerpt: string }

function parseCards(html: string): Card[] {
  const $ = load(html)
  const out: Card[] = []
  $('a.event-card').each((_, el) => {
    const a = $(el)
    const url = a.attr('href')
    const title = stripHtml(a.find('.event-card__heading').html() ?? '')
    if (!url || !title) return
    out.push({
      url,
      title,
      dates: stripHtml(a.find('.event-card__dates').html() ?? ''),
      times: stripHtml(a.find('.event-card__times').html() ?? ''),
      excerpt: stripHtml(a.find('.event-card__excerpt').html() ?? ''),
    })
  })
  return out
}

export const naturalVoiceUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    const cards: Card[] = []
    const seen = new Set<string>()
    for (let p = 1; p <= LIST_PAGES; p++) {
      const html = await get(p === 1 ? `${BASE}/events/` : `${BASE}/events/page/${p}/`)
      if (!html) break
      const page = parseCards(html)
      if (page.length === 0) break
      for (const c of page) if (!seen.has(c.url)) { seen.add(c.url); cards.push(c) }
    }

    const events: RawEvent[] = []
    let details = 0
    for (const c of cards) {
      if (ONLINE_RX.test(c.title) || ONLINE_RX.test(c.excerpt)) continue

      // Dates: "07 Oct 2026" or "07 Oct 2026—11 Oct 2026"
      const [startStr, endStr] = c.dates.split(/\s*[—–-]\s*(?=\d{1,2}\s+[A-Za-z]{3})/)
      const day = parseDay(startStr ?? '')
      if (!day) continue
      const endDay = endStr ? parseDay(endStr) : null
      if (details >= MAX_DETAILS) break

      details++
      const html = await get(c.url)
      if (!html) continue
      const $ = load(html)

      const side: Record<string, string> = {}
      $('.side-details__section').each((_, el) => {
        const tag = stripHtml($(el).find('.side-details__tag').html() ?? '').toLowerCase()
        const val = stripHtml(($(el).find('.side-details__content').html() ?? '').replace(/<br\s*\/?>|<\/p>\s*<p[^>]*>/gi, ', '))
        if (tag) side[tag] = val
      })
      const address = (side['address'] ?? '').replace(/\s*,\s*/g, ', ').replace(/(, )+/g, ', ').trim()
      if (ONLINE_RX.test(address)) continue

      const lat = parseFloat($('.map[data-lat]').attr('data-lat') ?? '')
      const lng = parseFloat($('.map[data-lng]').attr('data-lng') ?? '')
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue

      // Time: prefer the event page ("7.15pm – 9pm"), else the card's.
      const timeText = side['time'] || c.times
      const [t0, t1] = timeText.split(/\s*[—–-]\s*/)
      const st = t0 ? parseTime(t0) : null
      const et = t1 ? parseTime(t1) : null
      // Residential/whole-day events give no clock time: the date is real, use 10:00.
      const [sh, sm] = st ?? [10, 0]
      const starts_at = londonIso(day[0], day[1], day[2], sh, sm)
      const ed = endDay ?? day
      const ends_at = et ? londonIso(ed[0], ed[1], ed[2], et[0], et[1]) : (endDay ? londonIso(ed[0], ed[1], ed[2], 17, 0) : null)

      const body = stripHtml($('.entry-content, .content, main').first().html() ?? '')
      const runBy = side['run by'] ?? ''
      events.push({
        source: SRC,
        source_id: `nvn-${hashStr(c.url + starts_at)}`,
        source_url: c.url,
        title: c.title,
        description: (c.excerpt || body).slice(0, 500),
        organizer: runBy ? `${runBy} (Natural Voice Network)` : 'Natural Voice Network',
        location_name: address || 'See event page',
        lat, lng,
        starts_at,
        ends_at: ends_at && ends_at > starts_at ? ends_at : null,
        cost: side['cost'] ? side['cost'].slice(0, 120) : 'See event page',
        image_url: $('meta[property="og:image"]').attr('content') ?? null,
      })
    }
    return events
  },
}
