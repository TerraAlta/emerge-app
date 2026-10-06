/**
 * Ecosystem Restoration Communities (formerly Ecosystem Restoration Camps)
 * ecosystemrestorationcommunities.org — the old ecosystemrestorationcamps.org
 * domain redirects there.
 *
 * The site's events calendar plugin (MEC, /wp-json/wp/v2/mec-events) has
 * not been updated since mid-2025 and exposes no dates over REST. The live
 * list is the hand-built "Upcoming Events" / "Ongoing Events" section of
 * /get-involved/: each card is an Elementor container with an ekit title,
 * then heading widgets for the date line and the location line, a text
 * block and an arrow link. Date lines look like:
 *   "26 - 31 October 2026"
 *   "7 November 2026, 10h00 - 16h00"
 *   "Every Tuesday, 10h00 - 13h00"
 *   "1st and 3rd Thursday of every month, 16h00 - 19h00"
 * Month-only lines ("November, 2026") are skipped as too vague. Recurring
 * sessions are expanded to their occurrences in the next 4 weeks (respecting
 * a "from May until October" season in the description).
 *
 * Despite the "-na" name, ERC communities are worldwide; non-North-American
 * events are kept with their real locations. Times are local to the
 * community and converted with the country's zone; known ERC sites have
 * fixed coordinates, others go through Nominatim.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'erc-na'
const PAGE = 'https://ecosystemrestorationcommunities.org/get-involved/'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0; +https://emerge.terralta.org)'
const NOMINATIM_UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const ORG = 'Ecosystem Restoration Communities'
const RECUR_DAYS = 28
const MAX_GEOCODE = 8
const MAX_EVENTS = 200

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
}
const MONTH_RE = '(January|February|March|April|May|June|July|August|September|October|November|December)'
const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}
const WEEKDAY_RE = '(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)'
const ORD: Record<string, number> = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, first: 1, second: 2, third: 3, fourth: 4 }

// Country (as written in the location line's parentheses) → time zone
const COUNTRY_TZ: Record<string, string> = {
  portugal: 'Europe/Lisbon', spain: 'Europe/Madrid', ireland: 'Europe/Dublin', uk: 'Europe/London',
  'united kingdom': 'Europe/London', france: 'Europe/Paris', italy: 'Europe/Rome', netherlands: 'Europe/Amsterdam',
  belgium: 'Europe/Brussels', germany: 'Europe/Berlin', greece: 'Europe/Athens', egypt: 'Africa/Cairo',
  kenya: 'Africa/Nairobi', tanzania: 'Africa/Dar_es_Salaam', uganda: 'Africa/Kampala', togo: 'Africa/Lome',
  'south africa': 'Africa/Johannesburg', morocco: 'Africa/Casablanca', brazil: 'America/Sao_Paulo',
  mexico: 'America/Mexico_City', panama: 'America/Panama', 'costa rica': 'America/Costa_Rica',
  ecuador: 'America/Guayaquil', peru: 'America/Lima', colombia: 'America/Bogota', india: 'Asia/Kolkata',
}
const US_STATE_TZ: Record<string, string> = {
  california: 'America/Los_Angeles', oregon: 'America/Los_Angeles', washington: 'America/Los_Angeles',
  colorado: 'America/Denver', 'new mexico': 'America/Denver', utah: 'America/Denver', montana: 'America/Denver',
  arizona: 'America/Phoenix', texas: 'America/Chicago', minnesota: 'America/Chicago', wisconsin: 'America/Chicago',
  illinois: 'America/Chicago', missouri: 'America/Chicago', 'new york': 'America/New_York', vermont: 'America/New_York',
  massachusetts: 'America/New_York', maine: 'America/New_York', pennsylvania: 'America/New_York',
  'north carolina': 'America/New_York', virginia: 'America/New_York', georgia: 'America/New_York', florida: 'America/New_York',
  hawaii: 'Pacific/Honolulu',
}

// Known ERC sites (Nominatim doesn't know the farm names)
const KNOWN_SITES: Array<[RegExp, number, number]> = [
  [/vale da lama/i, 37.1493, -8.6558],           // Odiáxere, Lagos, Portugal
  [/s[ií]olta chro[ií]/i, 53.977, -6.7194],      // Carrickmacross, Co. Monaghan, Ireland
  [/elk run/i, 40.18, -105.23],                  // N Foothills Hwy, Longmont, CO, USA
  [/habiba/i, 29.035, 34.6617],                  // Nuweiba, South Sinai, Egypt
  [/field good fridays|kilfenora/i, 52.9899, -9.217], // Kilfenora, Co. Clare, Ireland
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function tzOffsetMin(ts: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

function zonedIso(y: number, mo: number, d: number, h: number, mi: number, tz: string): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - tzOffsetMin(guess, tz) * 60000).toISOString()
}

/** Today's Y/M/D in zone tz */
function todayIn(tz: string): [number, number, number] {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  )
  return [+p.year, +p.month, +p.day]
}

function tzFor(loc: string): string | null {
  const paren = loc.match(/\(([^)]+)\)\s*$/)
  const country = (paren?.[1] ?? loc.split(',').pop() ?? '').trim().toLowerCase()
  if (/^(us|usa|united states)$/.test(country)) {
    const l = loc.toLowerCase()
    for (const [state, tz] of Object.entries(US_STATE_TZ)) if (l.includes(state)) return tz
    return null
  }
  return COUNTRY_TZ[country] ?? null
}

interface Occ { start: string; end: string | null; key: string }

/** Parse the card's date line into concrete occurrences (local → UTC). */
function occurrences(dateTxt: string, desc: string, tz: string): Occ[] {
  const t = dateTxt.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()
  const hm = (s?: string) => (s ? +s : 0)
  let m: RegExpMatchArray | null

  // "26 - 31 October 2026"
  if ((m = t.match(new RegExp(`^(\\d{1,2}) ?- ?(\\d{1,2}) ${MONTH_RE},? (\\d{4})`, 'i')))) {
    const mo = MONTHS[m[3].toLowerCase()]
    return [{
      start: zonedIso(+m[4], mo, +m[1], 0, 0, tz),
      end: zonedIso(+m[4], mo, +m[2], 23, 59, tz),
      key: `${m[4]}-${mo}-${m[1]}`,
    }]
  }
  // "28 October - 3 November 2026"
  if ((m = t.match(new RegExp(`^(\\d{1,2}) ${MONTH_RE} ?- ?(\\d{1,2}) ${MONTH_RE},? (\\d{4})`, 'i')))) {
    const mo1 = MONTHS[m[2].toLowerCase()]
    const mo2 = MONTHS[m[4].toLowerCase()]
    const y2 = +m[5]
    const y1 = mo1 > mo2 ? y2 - 1 : y2
    return [{
      start: zonedIso(y1, mo1, +m[1], 0, 0, tz),
      end: zonedIso(y2, mo2, +m[3], 23, 59, tz),
      key: `${y1}-${mo1}-${m[1]}`,
    }]
  }
  // "7 November 2026, 10h00 - 16h00" (times optional)
  if ((m = t.match(new RegExp(`^(\\d{1,2}) ${MONTH_RE},? (\\d{4})(?:,? (\\d{1,2})[h:](\\d{2})(?: ?- ?(\\d{1,2})[h:](\\d{2}))?)?`, 'i')))) {
    const mo = MONTHS[m[2].toLowerCase()]
    const y = +m[3]
    const d = +m[1]
    const timed = m[4] !== undefined
    return [{
      start: zonedIso(y, mo, d, hm(m[4]), hm(m[5]), tz),
      end: m[6] !== undefined ? zonedIso(y, mo, d, +m[6], +m[7], tz) : timed ? null : zonedIso(y, mo, d, 23, 59, tz),
      key: `${y}-${mo}-${d}`,
    }]
  }

  // Recurring. Times are required (we won't invent them).
  const times = t.match(/(\d{1,2})[h:](\d{2}) ?- ?(\d{1,2})[h:](\d{2})/)
  if (!times) return []
  let matchDay: ((y: number, mo: number, d: number, wd: number) => boolean) | null = null
  if ((m = t.match(new RegExp(`^Every ${WEEKDAY_RE}`, 'i')))) {
    const wd = WEEKDAYS[m[1].toLowerCase()]
    matchDay = (_y, _mo, _d, w) => w === wd
  } else if ((m = t.match(new RegExp(`^(1st|2nd|3rd|4th|first|second|third|fourth)(?:,? (?:and|&) (1st|2nd|3rd|4th|first|second|third|fourth))? ${WEEKDAY_RE} of (?:every|each) month`, 'i')))) {
    const nths = [ORD[m[1].toLowerCase()], m[2] ? ORD[m[2].toLowerCase()] : 0].filter(Boolean)
    const wd = WEEKDAYS[m[3].toLowerCase()]
    matchDay = (_y, _mo, d, w) => w === wd && nths.includes(Math.ceil(d / 7))
  }
  if (!matchDay) return []

  // Optional season: "from May until October"
  const season = desc.match(new RegExp(`from ${MONTH_RE} (?:until|to|through|till) ${MONTH_RE}`, 'i'))
  const inSeason = (mo: number) => {
    if (!season) return true
    const a = MONTHS[season[1].toLowerCase()]
    const b = MONTHS[season[2].toLowerCase()]
    return a <= b ? mo >= a && mo <= b : mo >= a || mo <= b
  }

  const [ty, tmo, td] = todayIn(tz)
  const out: Occ[] = []
  for (let i = 0; i <= RECUR_DAYS; i++) {
    const day = new Date(Date.UTC(ty, tmo - 1, td + i))
    const y = day.getUTCFullYear()
    const mo = day.getUTCMonth() + 1
    const d = day.getUTCDate()
    if (!inSeason(mo) || !matchDay(y, mo, d, day.getUTCDay())) continue
    out.push({
      start: zonedIso(y, mo, d, +times[1], +times[2], tz),
      end: zonedIso(y, mo, d, +times[3], +times[4], tz),
      key: `${y}-${mo}-${d}`,
    })
  }
  return out
}

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15000) },
    )
    if (!res.ok) return null
    const d = await res.json()
    return d[0] ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) } : null
  } catch {
    return null
  }
}

export const ercNa: SourceFetcher = {
  name: SRC,
  async fetch() {
    let html: string
    try {
      const res = await fetch(PAGE, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) return []
      html = await res.text()
    } catch (err) {
      console.warn(`[${SRC}] fetch failed:`, (err as Error).message)
      return []
    }

    const $ = load(html)
    const events: RawEvent[] = []
    const geoCache = new Map<string, { lat: number; lng: number } | null>()
    let geocodes = 0

    for (const h of $('h2.ekit-heading--title').toArray()) {
      const title = stripHtml($(h).text())
      if (!title) continue
      const card = $(h).closest('.elementor-widget').parent()
      const lines = card.children('.elementor-widget-heading').toArray()
        .map((el) => stripHtml($(el).find('.elementor-heading-title').text()))
        .filter(Boolean)
      if (lines.length < 2) continue
      const [dateTxt, locTxt] = lines
      const desc = stripHtml(card.find('.elementor-widget-text-editor').first().html() ?? '')
      if (/\b(online|virtual|webinar|zoom)\b/i.test(`${title} ${locTxt}`)) continue

      const tz = tzFor(locTxt)
      if (!tz) continue
      const occ = occurrences(dateTxt, desc, tz)
      if (occ.length === 0) continue

      // Coordinates: known site, else Nominatim with progressively shorter queries
      let geo: { lat: number; lng: number } | null = null
      const known = KNOWN_SITES.find(([re]) => re.test(`${locTxt} ${title}`))
      if (known) {
        geo = { lat: known[1], lng: known[2] }
      } else {
        const parts = locTxt
          .replace(/\bERC\b/g, '').replace(/\bnear\b/gi, '')
          .replace(/\(([^)]+)\)/g, ', $1')
          .split(',').map((s) => s.trim()).filter(Boolean)
        for (let i = 0; i < parts.length - 1 && !geo && geocodes < MAX_GEOCODE; i++) {
          const q = parts.slice(i).join(', ')
          if (!geoCache.has(q)) {
            if (geocodes > 0) await sleep(1100)
            geocodes++
            geoCache.set(q, await geocode(q))
          }
          geo = geoCache.get(q) ?? null
        }
      }
      if (!geo) continue

      const href = card.find('a.elementor-icon').attr('href') ?? ''
      const url = /^https?:/i.test(href) ? href : PAGE
      const img = card.parent().find('img').first().attr('src') ?? null
      for (const o of occ) {
        events.push({
          source: SRC,
          source_id: `erc-${hashStr(`${title}|${o.key}`)}`,
          source_url: url,
          title,
          description: desc.slice(0, 500),
          organizer: ORG,
          location_name: locTxt.replace(/​/g, '').trim(),
          lat: geo.lat,
          lng: geo.lng,
          starts_at: o.start,
          ends_at: o.end,
          cost: /donation/i.test(desc) ? 'Donation-based' : /volunteer/i.test(`${title} ${desc}`) ? 'Free (volunteer)' : 'See event page',
          image_url: img,
        })
      }
      if (events.length >= MAX_EVENTS) break
    }
    return events.slice(0, MAX_EVENTS)
  },
}
