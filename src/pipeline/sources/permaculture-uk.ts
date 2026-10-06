/**
 * Permaculture Association UK — https://www.permaculture.org.uk/events
 *
 * The site is Drupal (no Events Calendar API, no ICS). The /events page lists
 * event cards with a machine-readable <time datetime="YYYY-MM-DD"> start, an
 * optional end, a town, and an "onlinetag-1" marker for online events. Each
 * in-person event's detail page carries a full postal address, which we
 * geocode (postcodes.io for UK postcodes, Nominatim otherwise).
 *
 * Only the date is published on the list (times live in free text), so
 * starts_at is the start date at 10:00 UK time.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'permaculture-uk'
const BASE = 'https://www.permaculture.org.uk'
const LIST_URL = `${BASE}/events`
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
const TIMEOUT = 20000
const MAX_DETAIL = 15
// Permaculture Association office, Leeds — used only if geocoding fails for a UK venue
const HQ = { lat: 53.7997, lng: -1.5492 }

export const permacultureUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await get(LIST_URL)
    if (!html) return []
    const $ = load(html)

    type Card = { url: string; title: string; start: string; end: string | null; town: string; image: string | null }
    const cards: Card[] = []
    $('.card--eventcourse').each((_, el) => {
      const card = $(el)
      // onlinetag-1 = online event; skip
      if (card.find('.onlinetag-1').length > 0) return
      const a = card.find('.card-title a').first()
      const href = a.attr('href')
      const title = stripHtml(a.text())
      const times = card.find('time[datetime]')
      const start = times.eq(0).attr('datetime') ?? ''
      if (!href || !title || !/^\d{4}-\d{2}-\d{2}/.test(start)) return
      const end = times.length > 1 ? times.eq(times.length - 1).attr('datetime') ?? null : null
      // Town is the text after the <br> in the card-text paragraph
      const p = card.find('p.card-text').first().clone()
      p.find('time').remove()
      const town = stripHtml(p.text().replace(/^[\s-]+/, '')).replace(/^[-–\s]+/, '')
      const img = card.find('img').first().attr('src')
      cards.push({
        url: href.startsWith('http') ? href : `${BASE}${href}`,
        title, start, end, town,
        image: img ? (img.startsWith('http') ? img : `${BASE}${img}`) : null,
      })
    })

    const now = Date.now()
    const events: RawEvent[] = []
    let details = 0
    for (const c of cards) {
      const startsAt = ukDate(c.start, 10)
      if (!startsAt) continue
      const endsAt = c.end ? ukDate(c.end, 17) : null
      // Skip events already over (multi-day ones that started in the past but end later are kept)
      if (new Date(endsAt ?? startsAt).getTime() < now) continue
      if (details >= MAX_DETAIL) break
      details++

      const detail = await get(c.url)
      let address = ''
      let summary = ''
      if (detail) {
        const $d = load(detail)
        address = stripHtml($d('.field--name-field-postal-address').text().replace(/Address of venue/i, ''))
        summary = stripHtml(($d('.field--name-field-event-summary').html() ?? '').replace(/<br\s*\/?>|<\/(?:p|div|li|h\d)>/gi, ' ')).replace(/^Event summary\s*/i, '')
      }
      if (/\bonline\b|zoom/i.test(address) && !/\d/.test(address)) continue

      const where = address || c.town
      if (!where) continue
      const geo = await geocode(where, c.town)
      if (!geo) continue

      events.push({
        source: SRC,
        source_id: `pa-uk-${hashStr(c.url + c.start)}`,
        source_url: c.url,
        title: c.title,
        description: summary.slice(0, 500) || `Permaculture event in ${c.town || 'the UK'}.`,
        organizer: 'Permaculture Association',
        location_name: where,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startsAt,
        ends_at: endsAt,
        cost: 'See event page',
        image_url: c.image,
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

/** YYYY-MM-DD at a given hour, UK local time (BST Apr–Oct approximated by month). */
function ukDate(ymd: string, hour: number): string | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [y, mo, d] = [+m[1], +m[2], +m[3]]
  const bst = mo >= 4 && mo <= 10
  const dt = new Date(Date.UTC(y, mo - 1, d, hour - (bst ? 1 : 0)))
  return isNaN(dt.getTime()) ? null : dt.toISOString()
}

const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

async function geocode(address: string, town: string): Promise<{ lat: number; lng: number } | null> {
  const pc = address.match(UK_POSTCODE)
  if (pc) {
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc[1] + pc[2])}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT),
      })
      if (res.ok) {
        const d = await res.json()
        if (d.result?.latitude && d.result?.longitude) return { lat: d.result.latitude, lng: d.result.longitude }
      }
    } catch { /* fall through */ }
  }
  for (const q of [address, town].filter(Boolean)) {
    await new Promise(r => setTimeout(r, 1100)) // Nominatim: max 1 req/s
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(TIMEOUT) },
      )
      if (res.ok) {
        const d = await res.json()
        if (d[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
      }
    } catch { /* next */ }
  }
  // UK venue we couldn't place: use the Association's office rather than dropping it
  if (/united kingdom|england|scotland|wales|\bUK\b/i.test(address)) return HQ
  return null
}
