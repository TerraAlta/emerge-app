/**
 * Centre for Alternative Technology — cat.org.uk
 * Short courses, open days and the annual conference at CAT, Machynlleth, Wales.
 *
 * The site runs WP Event Manager. One call to its AJAX listing endpoint
 * (`/em-ajax/get_listings/`) returns every published event with its date
 * range; each event page then carries schema.org Event JSON-LD with the real
 * start/end time, which we read for the upcoming ones (capped, sequential).
 * Online-only courses (title "… Online" or OnlineEventAttendanceMode) are skipped.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'cat-uk'
const BASE = 'https://cat.org.uk'
const LISTINGS_URL = `${BASE}/em-ajax/get_listings/?per_page=100&orderby=event_start_date&order=ASC`
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
const MAX_DETAIL_FETCHES = 24
// CAT visitor centre, Llwyngwern Quarry, Machynlleth SY20 9AZ
const CAT_LAT = 52.6236
const CAT_LNG = -3.8384

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

/** UK wall-clock time → ISO (UTC). BST runs last Sunday of March → last Sunday of October, 01:00 UTC. */
function ukLocalToIso(y: number, mo: number, d: number, h = 0, mi = 0): string {
  const lastSunday = (month0: number) => {
    const last = new Date(Date.UTC(y, month0 + 1, 0))
    return last.getUTCDate() - last.getUTCDay()
  }
  const bstStart = Date.UTC(y, 2, lastSunday(2), 1)
  const bstEnd = Date.UTC(y, 9, lastSunday(9), 1)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  const offset = asUtc - 3600_000 >= bstStart && asUtc - 3600_000 < bstEnd ? 3600_000 : 0
  return new Date(asUtc - offset).toISOString()
}

/** "5 October 2026" → {y,mo,d} */
function parseDayMonthYear(s: string): { y: number; mo: number; d: number } | null {
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (!m) return null
  const mo = MONTHS[m[2].toLowerCase()]
  if (!mo) return null
  return { y: +m[3], mo, d: +m[1] }
}

/** "2027-06-12 09:30:00" (UK local) → parts */
function parseLocalStamp(s: unknown): { y: number; mo: number; d: number; h: number; mi: number } | null {
  if (typeof s !== 'string') return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return null
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] }
}

async function get(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json' },
      signal: AbortSignal.timeout(20000),
    })
    return res.ok ? res : null
  } catch (err) {
    console.warn(`[${SRC}] ${url} failed:`, (err as Error).message)
    return null
  }
}

interface Listing {
  url: string
  title: string
  start: { y: number; mo: number; d: number }
  end: { y: number; mo: number; d: number } | null
  location: string
  type: string
  image: string | null
}

function parseListings(html: string): Listing[] {
  const $ = load(html)
  const out: Listing[] = []
  $('.wpem-event-layout-wrapper').each((_, el) => {
    const box = $(el)
    const url = box.find('a.wpem-event-action-url').attr('href')
    const title = stripHtml(box.find('.wpem-event-title').text())
    const dateText = stripHtml(box.find('.wpem-event-date-time-text').first().text())
    if (!url || !title || !dateText) return
    const [a, b] = dateText.split(/\s+[–-]\s+/)
    const start = parseDayMonthYear(a ?? '')
    if (!start) return
    const end = b ? parseDayMonthYear(b) : null
    const loc = stripHtml(box.find('.wpem-event-location-text').text())
    const bg = box.find('.wpem-event-banner-img').attr('style') ?? ''
    const img = bg.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1] ?? null
    out.push({
      url,
      title,
      start,
      end,
      location: loc && loc !== '-' ? loc : 'Centre for Alternative Technology',
      type: stripHtml(box.find('.wpem-event-type-text').first().text()),
      image: img,
    })
  })
  return out
}

/** Pull the schema.org Event out of an event page. */
function eventJsonLd(html: string): any | null {
  const $ = load(html)
  let found: any = null
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return
    try {
      const data = JSON.parse($(el).contents().text())
      const items = Array.isArray(data) ? data : data['@graph'] ?? [data]
      found = items.find((i: any) => i?.['@type'] === 'Event') ?? null
    } catch { /* skip malformed */ }
  })
  if (found) found.__ogDescription = $('meta[property="og:description"]').attr('content') ?? ''
  return found
}

function isOnline(title: string, ld: any): boolean {
  if (/\bonline\b/i.test(title)) return true
  const mode = String(ld?.eventAttendanceMode ?? '')
  return /OnlineEventAttendanceMode/.test(mode)
}

export const catUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    const res = await get(LISTINGS_URL)
    if (!res) return []
    let html = ''
    try {
      const data = await res.json()
      html = typeof data?.html === 'string' ? data.html : ''
    } catch {
      console.warn(`[${SRC}] listings response was not JSON`)
      return []
    }
    const listings = parseListings(html)

    // Only bother with events whose last day hasn't passed
    const todayUtc = Date.now() - 24 * 3600_000
    const upcoming = listings.filter(l => {
      const last = l.end ?? l.start
      return Date.UTC(last.y, last.mo - 1, last.d) >= todayUtc && !/\bonline\b/i.test(l.title)
    })

    const events: RawEvent[] = []
    let detailFetches = 0
    for (const l of upcoming) {
      let ld: any = null
      if (detailFetches < MAX_DETAIL_FETCHES) {
        detailFetches++
        const page = await get(l.url)
        if (page) ld = eventJsonLd(await page.text())
      }
      if (isOnline(l.title, ld)) continue

      // Time from JSON-LD if it agrees with the listing's date; else 09:30 (CAT's usual course start)
      const st = parseLocalStamp(ld?.startDate)
      const sameDay = st && st.y === l.start.y && st.mo === l.start.mo && st.d === l.start.d
      const startsAt = sameDay
        ? ukLocalToIso(st.y, st.mo, st.d, st.h, st.mi)
        : ukLocalToIso(l.start.y, l.start.mo, l.start.d, 9, 30)

      // End: listing's last day + JSON-LD end time. The plugin stores 12h times
      // without am/pm ("03:30" for 3:30pm), so bump into the afternoon when needed.
      let endsAt: string | null = null
      const endDay = l.end ?? l.start
      const et = parseLocalStamp(ld?.endDate)
      if (et) {
        let h = et.h
        if (h < 8) h += 12
        const iso = ukLocalToIso(endDay.y, endDay.mo, endDay.d, h, et.mi)
        if (iso > startsAt) endsAt = iso
      }

      const desc = stripHtml(ld?.__ogDescription || ld?.description || '')
      events.push({
        source: SRC,
        source_id: `cat-${hashStr(l.url + startsAt)}`,
        source_url: l.url,
        title: l.title.replace(/\s*\((?:sold out)\)\s*$/i, '').trim(),
        description: (desc || `${l.type || 'Event'} at the Centre for Alternative Technology, Machynlleth.`).slice(0, 500),
        organizer: 'Centre for Alternative Technology',
        // Every listed course runs on site (blank / Welsh-name locations included)
        location_name: 'Centre for Alternative Technology, Machynlleth, Wales',
        lat: CAT_LAT,
        lng: CAT_LNG,
        starts_at: startsAt,
        ends_at: endsAt,
        cost: /sold out/i.test(l.title) ? 'Sold out' : 'See event page',
        image_url: (typeof ld?.image === 'string' && ld.image) || l.image,
      })
    }
    return events
  },
}
