/**
 * Biodynamic Association — www.biodynamics.com (Drupal 7)
 * Conferences, workshops, farm days and prep-making across North America.
 *
 * /events now redirects to a login page; the public calendar is the Drupal
 * Calendar month view at /calendar/month/YYYY-MM. Each cell lists the
 * event link, its date (or date range) as dc:date content, city, state and
 * country. Events are date-only (no time of day); when the title or the
 * start of the description has an explicit range ("10am-12pm") we use it,
 * otherwise we start them at 10:00 local time in the state's time zone (majority zone for split
 * states) and end multi-day ones at 17:00 on the last day.
 *
 * We read the current month plus the next 3, then fetch up to 18 event
 * pages (soonest first) for description, venue name, region and type —
 * region "Online" and events with no city/state are skipped. Events beyond
 * the detail budget keep the listing data (still need a city + state).
 * Coordinates: Nominatim on "venue, city, state" → "city, state", cached.
 * US events only (the calendar also carries Canada/international).
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'biodynamics-usa'
const BASE = 'https://www.biodynamics.com'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0; +https://emerge.terralta.org)'
const NOMINATIM_UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const ORG = 'Biodynamic Association'
const MONTHS_AHEAD = 4
const MAX_DETAIL = 18
const MAX_EVENTS = 200

const STATES: Record<string, [string, string]> = {
  // name → [abbr, IANA zone (majority zone for split states)]
  alabama: ['AL', 'America/Chicago'], alaska: ['AK', 'America/Anchorage'], arizona: ['AZ', 'America/Phoenix'],
  arkansas: ['AR', 'America/Chicago'], california: ['CA', 'America/Los_Angeles'], colorado: ['CO', 'America/Denver'],
  connecticut: ['CT', 'America/New_York'], delaware: ['DE', 'America/New_York'],
  'district of columbia': ['DC', 'America/New_York'], florida: ['FL', 'America/New_York'],
  georgia: ['GA', 'America/New_York'], hawaii: ['HI', 'Pacific/Honolulu'], idaho: ['ID', 'America/Boise'],
  illinois: ['IL', 'America/Chicago'], indiana: ['IN', 'America/Indiana/Indianapolis'], iowa: ['IA', 'America/Chicago'],
  kansas: ['KS', 'America/Chicago'], kentucky: ['KY', 'America/New_York'], louisiana: ['LA', 'America/Chicago'],
  maine: ['ME', 'America/New_York'], maryland: ['MD', 'America/New_York'], massachusetts: ['MA', 'America/New_York'],
  michigan: ['MI', 'America/Detroit'], minnesota: ['MN', 'America/Chicago'], mississippi: ['MS', 'America/Chicago'],
  missouri: ['MO', 'America/Chicago'], montana: ['MT', 'America/Denver'], nebraska: ['NE', 'America/Chicago'],
  nevada: ['NV', 'America/Los_Angeles'], 'new hampshire': ['NH', 'America/New_York'],
  'new jersey': ['NJ', 'America/New_York'], 'new mexico': ['NM', 'America/Denver'],
  'new york': ['NY', 'America/New_York'], 'north carolina': ['NC', 'America/New_York'],
  'north dakota': ['ND', 'America/Chicago'], ohio: ['OH', 'America/New_York'], oklahoma: ['OK', 'America/Chicago'],
  oregon: ['OR', 'America/Los_Angeles'], pennsylvania: ['PA', 'America/New_York'],
  'rhode island': ['RI', 'America/New_York'], 'south carolina': ['SC', 'America/New_York'],
  'south dakota': ['SD', 'America/Chicago'], tennessee: ['TN', 'America/Chicago'], texas: ['TX', 'America/Chicago'],
  utah: ['UT', 'America/Denver'], vermont: ['VT', 'America/New_York'], virginia: ['VA', 'America/New_York'],
  washington: ['WA', 'America/Los_Angeles'], 'west virginia': ['WV', 'America/New_York'],
  wisconsin: ['WI', 'America/Chicago'], wyoming: ['WY', 'America/Denver'],
}
// A few counties sit in the minority zone of their state.
const CITY_ZONE: Record<string, string> = {
  'scottsbluff|nebraska': 'America/Denver', 'scotts bluff|nebraska': 'America/Denver',
  'gering|nebraska': 'America/Denver', 'ontario|oregon': 'America/Boise',
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

function offsetMin(zone: string, ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

function localIso(zone: string, ymd: string, h: number, mi: number): string {
  const [y, mo, d] = ymd.split('-').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - offsetMin(zone, guess) * 60000).toISOString()
}

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastGeo = 0
async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache.has(q)) return geoCache.get(q)!
  const wait = 1100 - (Date.now() - lastGeo)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastGeo = Date.now()
  let out: { lat: number; lng: number } | null = null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': NOMINATIM_UA }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      if (Array.isArray(d) && d[0]) {
        const lat = parseFloat(d[0].lat), lng = parseFloat(d[0].lon)
        if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) out = { lat, lng }
      }
    }
  } catch { /* ignore */ }
  geoCache.set(q, out)
  return out
}

interface Listing {
  path: string
  title: string
  startDate: string // YYYY-MM-DD
  endDate: string | null
  city: string
  state: string
  country: string
}

function parseMonth(html: string): Listing[] {
  const $ = load(html)
  const out: Listing[] = []
  $('.view-item-bda_event_calendar').each((_, el) => {
    const it = $(el)
    const a = it.find('.views-field-title a').first()
    const path = a.attr('href')
    const title = stripHtml(a.text())
    if (!path || !title) return
    const startC = it.find('.date-display-start').attr('content') ?? it.find('.date-display-single').attr('content') ?? ''
    const endC = it.find('.date-display-end').attr('content') ?? ''
    const sd = startC.match(/^(\d{4}-\d{2}-\d{2})/)
    if (!sd) return
    const ed = endC.match(/^(\d{4}-\d{2}-\d{2})/)
    out.push({
      path,
      title,
      startDate: sd[1],
      endDate: ed && ed[1] !== sd[1] ? ed[1] : null,
      city: it.find('.views-field-city .field-content').text().trim(),
      state: it.find('.views-field-province .field-content').text().trim(),
      country: it.find('.views-field-country .field-content').text().trim(),
    })
  })
  return out
}

interface Detail {
  description: string
  venue: string
  region: string
  types: string[]
  image: string | null
  link: string | null
}

function parseDetail(html: string): Detail {
  const $ = load(html)
  const field = (n: string) => $(`.field-name-${n} .field-items`).first()
  return {
    description: stripHtml(field('body').html() ?? ''),
    venue: $('.field-name-field-location [itemprop="name"]').first().text().trim(),
    region: field('field-eventregion').text().trim(),
    types: field('field-eventtype').find('.field-item').toArray().map((x) => $(x).text().trim()),
    image: field('field-eventimage').find('img').attr('src') ?? null,
    link: field('field-eventwebsitelink').find('a').attr('href') ?? null,
  }
}

const TIME_RANGE = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*(?:to|-|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b/i

function to24(h: number, ap: string): number {
  const pm = ap.toLowerCase() === 'p'
  if (h === 12) return pm ? 12 : 0
  return pm ? h + 12 : h
}

const ONLINE = /\b(online|webinar|virtual|zoom|livestream)\b/i

export const biodynamicsUsa: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = new Date()
    const todayYmd = now.toISOString().slice(0, 10)
    const listings = new Map<string, Listing>()

    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const html = await get(`${BASE}/calendar/month/${ym}`)
      if (!html) continue
      for (const l of parseMonth(html)) {
        // The path carries the occurrence date(s); a multi-day event shows on
        // every day it spans — keep one entry per path.
        if (!listings.has(l.path)) listings.set(l.path, l)
      }
    }

    const upcoming = [...listings.values()]
      .filter((l) => (l.endDate ?? l.startDate) >= todayYmd)
      .filter((l) => /united.?states/i.test(l.country))
      .filter((l) => l.state && STATES[l.state.toLowerCase()])
      .filter((l) => !ONLINE.test(l.title))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))

    const events: RawEvent[] = []
    let details = 0
    for (const l of upcoming) {
      if (events.length >= MAX_EVENTS) break
      const url = new URL(l.path, BASE).toString()

      let det: Detail | null = null
      if (details < MAX_DETAIL) {
        details++
        const html = await get(url)
        if (html) det = parseDetail(html)
      }
      if (det && (/online/i.test(det.region) || det.types.some((t) => ONLINE.test(t)))) continue
      if (!l.city && !det?.venue) continue

      const stateKey = l.state.toLowerCase()
      const [abbr, stateZone] = STATES[stateKey]
      const zone = CITY_ZONE[`${l.city.toLowerCase()}|${stateKey}`] ?? stateZone

      let venue = (det?.venue ?? '').replace(/\s+/g, ' ').trim()
      if (venue.length < 3) venue = ''
      if (l.city && venue.toLowerCase().includes(l.city.toLowerCase())) {
        venue = venue.replace(new RegExp(`,?\\s*${l.city}.*$`, 'i'), '').trim()
      }
      const cityState = [l.city, abbr].filter(Boolean).join(', ')
      let geo = venue ? await geocode(`${venue}, ${cityState}`) : null
      if (!geo && l.city) geo = await geocode(`${l.city}, ${l.state}`)
      if (!geo) continue

      // Times only when the organiser wrote an explicit range ("10am-12pm",
      // "10:00 AM to 3:00 PM") in the title or the start of the description.
      const tr = `${l.title} ${(det?.description ?? '').slice(0, 250)}`.match(TIME_RANGE)
      let starts: string
      let ends: string | null
      if (tr) {
        starts = localIso(zone, l.startDate, to24(+tr[1], tr[3]), tr[2] ? +tr[2] : 0)
        ends = localIso(zone, l.endDate ?? l.startDate, to24(+tr[4], tr[6]), tr[5] ? +tr[5] : 0)
        if (ends <= starts) ends = null
      } else {
        starts = localIso(zone, l.startDate, 10, 0)
        ends = l.endDate ? localIso(zone, l.endDate, 17, 0) : null
      }
      const note = tr ? '' : ' (Date only — check the event page for times.)'
      const locationName = [venue, cityState].filter(Boolean).join(', ')
      const type = det?.types.length ? `${det.types.join(' / ')}. ` : ''
      const desc = det?.description || `Biodynamic ${type ? type.toLowerCase() : 'event '}in ${cityState}.`

      events.push({
        source: SRC,
        source_id: `bda-${l.path.replace(/^\/event\//, '').replace(/\W+/g, '-').slice(0, 120)}`,
        source_url: url,
        title: l.title,
        description: `${type}${desc.slice(0, 400)}${note}`.slice(0, 500),
        organizer: ORG,
        location_name: locationName,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: starts,
        ends_at: ends,
        cost: 'See event page',
        image_url: det?.image ?? null,
      })
    }
    return events
  },
}
