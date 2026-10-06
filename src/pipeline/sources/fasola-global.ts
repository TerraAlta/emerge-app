/**
 * FaSoLa / Sacred Harp — annual shape-note singings worldwide.
 *
 * fasola.org/singings points to the community-maintained directory at
 *   https://shapenotesingings.com/   ("Annual Singings", ~350 entries)
 * One server-rendered page; every singing is a <tr class="colored-row"> with
 * data-* attributes: name, venue (name/street/city), lat/lng, time-start/end,
 * time-zone, duration (days), details text, and the RECURRENCE RULE the site
 * itself uses to show the next date (computed client-side in its JS):
 *   rec-type standard : <rec-nth> <rec-dow> of <rec-month>, + rec-offset days
 *   rec-type advanced : holiday anchors (Labor Day, Palm Sunday, Nth 5th Sunday…)
 *   rec-type manual / one_time : manual-date
 *   start = rule date + offset − (duration − 1)   (multi-day singings start earlier)
 *   data-cancelled = a date on which that year's singing is cancelled
 * We reproduce exactly that computation (no today-fallback: rows whose rule
 * can't be evaluated are skipped). Date-only rows default to 10:00 local.
 *
 * Time zones: US/Canada rows carry a per-state zone in data-time-zone; for
 * other countries that field is unreliable (Aarhus → Europe/London), so we
 * use the country's zone.
 */
import type { RawEvent, SourceFetcher } from './types'
import { decodeEntities } from './utils'
import { getText, tzFor, zonedIso } from './global-common'

const SRC = 'fasola-global'
const BASE = 'https://shapenotesingings.com'
const WINDOW_DAYS = 200
const MAX_EVENTS = 200

const COUNTRY_CC: Record<string, string> = {
  usa: 'us', uk: 'gb', canada: 'ca', germany: 'de', australia: 'au', ireland: 'ie', denmark: 'dk',
  austria: 'at', nor: 'no', norway: 'no', switz: 'ch', switzerland: 'ch', poland: 'pl', netherlands: 'nl',
  france: 'fr', israel: 'il', 'south korea': 'kr', korea: 'kr', japan: 'jp', 'new zealand': 'nz', sweden: 'se',
}
const DOW: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
const NTH: Record<string, number | 'last'> = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, last: 'last' }
const BOOKS: Record<string, string> = {
  denson: 'The Sacred Harp (Denson revision)', cooper: 'The Sacred Harp (Cooper revision)',
  ch2010: 'The Christian Harmony', jlwhite: 'The Sacred Harp (J.L. White)', shenandoah: 'Shenandoah Harmony',
}

type D = { y: number; m: number; d: number } // calendar date, month 1-12

const mk = (y: number, m: number, d: number): D => {
  const t = new Date(Date.UTC(y, m - 1, d))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}
const addDays = (x: D, n: number) => mk(x.y, x.m, x.d + n)
const dow = (x: D) => new Date(Date.UTC(x.y, x.m - 1, x.d)).getUTCDay()
const key = (x: D) => x.y * 10000 + x.m * 100 + x.d

/** nth (1-4 | 'last') weekday `wd` of month `m` in year `y` */
function nthWeekday(y: number, m: number, nth: number | 'last', wd: number): D {
  let day = 1 + ((wd - dow(mk(y, m, 1)) + 7) % 7)
  if (nth === 'last') {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    while (day + 7 <= last) day += 7
  } else day += (nth - 1) * 7
  return mk(y, m, day)
}

function easter(y: number): D {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  return mk(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1)
}

/** All Sundays that are the 5th Sunday of their month, in year y. */
function fifthSundays(y: number): D[] {
  const out: D[] = []
  let x = mk(y, 1, 1)
  while (dow(x) !== 0) x = addDays(x, 1)
  const count: Record<number, number> = {}
  while (x.y === y) {
    count[x.m] = (count[x.m] ?? 0) + 1
    if (count[x.m] === 5) out.push(x)
    x = addDays(x, 7)
  }
  return out
}

function anchorDate(anchor: string, y: number, a: (k: string) => string): D | null {
  if (anchor === 'fifth_sunday') {
    const fs = fifthSundays(y)
    const n = parseInt(a('fifth-num')) || 1
    const dir = a('fifth-dir'), ref = a('fifth-ref')
    if (dir && ref) {
      const [rm, rd] = ref.split('-').map(Number)
      if (!rm || !rd) return null
      const rk = key(mk(y, rm, rd))
      return (dir === 'after' ? fs.filter((d) => key(d) > rk) : fs.filter((d) => key(d) < rk).reverse())[n - 1] ?? null
    }
    return fs[n - 1] ?? null
  }
  switch (anchor) {
    case 'new_years_day': return mk(y, 1, 1)
    case 'new_years_eve': return mk(y, 12, 31)
    case 'boxing_day': return mk(y, 12, 26)
    case 'memorial_day': return nthWeekday(y, 5, 'last', 1)
    case 'labor_day': return nthWeekday(y, 9, 1, 1)
    case 'mlk_day': return nthWeekday(y, 1, 3, 1)
    case 'thanksgiving': return nthWeekday(y, 11, 4, 4)
    case 'palm_sunday': return addDays(easter(y), -7)
    case 'whitsun': return addDays(easter(y), 49)
    case 'first_5th_sunday_of_year': return fifthSundays(y)[0] ?? null
    case 'first_5th_sunday_after_july_4': return fifthSundays(y).find((d) => key(d) > key(mk(y, 7, 4))) ?? null
    case 'last_5th_sunday_before_thanksgiving': {
      const tg = key(nthWeekday(y, 11, 4, 4))
      return fifthSundays(y).filter((d) => key(d) < tg).pop() ?? null
    }
    default: return null // unknown anchor: don't guess
  }
}

/** Start date of the singing in year y, per the site's own rule. */
function startFor(y: number, a: (k: string) => string): D | null {
  const type = a('rec-type')
  const offset = parseInt(a('rec-offset')) || 0
  const dur = parseInt(a('duration')) || 1
  let r: D | null = null
  if (type === 'manual' || type === 'one_time') {
    const m = a('manual-date').match(/^(\d{4})-(\d{2})-(\d{2})$/)
    return m ? mk(+m[1], +m[2], +m[3]) : null
  }
  if (type === 'standard') {
    const mo = parseInt(a('rec-month')), nth = NTH[a('rec-nth')], wd = DOW[a('rec-dow').toLowerCase()]
    if (!mo || nth === undefined || wd === undefined) return null
    r = nthWeekday(y, mo, nth, wd)
  } else if (type === 'advanced') {
    const anchor = a('rec-anchor')
    if (!anchor) return null
    r = anchorDate(anchor, y, a)
  }
  if (!r) return null
  return addDays(r, offset - (dur - 1))
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase())
}

export const fasolaGlobal: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(`${BASE}/`)
    if (!html) return []

    const now = Date.now()
    const horizon = now + WINDOW_DAYS * 86400_000
    const thisYear = new Date().getUTCFullYear()
    const events: RawEvent[] = []
    const seen = new Set<string>()

    const rowRe = /<tr class="colored-row"([^>]*)>([\s\S]*?)<\/tr>/g
    let m: RegExpExecArray | null
    while ((m = rowRe.exec(html)) !== null) {
      const attrs = m[1]
      const a = (k: string): string => {
        const mm = attrs.match(new RegExp(`\\sdata-${k}="([^"]*)"`))
        return mm ? decodeEntities(mm[1]).trim() : ''
      }
      if (/varies/i.test(a('when-override'))) continue
      const lat = parseFloat(a('lat')), lng = parseFloat(a('lng'))
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue

      const country = a('country')
      const cc = COUNTRY_CC[country.toLowerCase()]
      if (!cc) continue
      const dataTz = a('time-zone')
      const tz = (cc === 'us' || cc === 'ca') && dataTz ? dataTz : tzFor(cc, lat, lng, a('state'))

      const [sh, sm] = (a('time-start').match(/^(\d{1,2}):(\d{2})/)?.slice(1).map(Number) ?? [10, 0])
      const cancelled = a('cancelled')
      let startIso: string | null = null
      let start: D | null = null
      for (const y of [thisYear, thisYear + 1]) {
        const d = startFor(y, a)
        if (!d) continue
        const iso = zonedIso(d.y, d.m, d.d, sh, sm, tz)
        if (!iso) continue
        const ms = Date.parse(iso)
        if (ms < now + 3600_000) continue
        const ds = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
        if (cancelled && cancelled === ds) continue
        startIso = iso
        start = d
        break
      }
      if (!startIso || !start || Date.parse(startIso) > horizon) continue

      const dur = Math.max(1, parseInt(a('duration')) || 1)
      const endT = a('time-end').match(/^(\d{1,2}):(\d{2})/)
      let endIso: string | null = null
      if (endT) {
        const last = addDays(start, dur - 1)
        endIso = zonedIso(last.y, last.m, last.d, +endT[1], +endT[2], tz)
        if (endIso && Date.parse(endIso) <= Date.parse(startIso)) endIso = null
      }

      const name = decodeEntities(m[2].match(/class="singing-name-link"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '').trim() || titleCase(a('name'))
      const href = a('href')
      const url = href ? new URL(href, BASE).toString() : `${BASE}/`
      const k = `${href || name}|${startIso}`
      if (seen.has(k)) continue
      seen.add(k)

      const venueName = a('venue-name')
      const street = a('venue-street')
      const city = a('venue-city') || titleCase(a('city'))
      const region = cc === 'us' || cc === 'ca' || cc === 'au' ? a('state').toUpperCase()
        : ({ switz: 'Switzerland', nor: 'Norway' } as Record<string, string>)[country.toLowerCase()] ?? country
      const locParts = [...new Set([venueName, street, city, region].filter((p) => p && !/^(tbd|tba)$/i.test(p)))]
      const book = BOOKS[a('book')] ?? a('books-full')
      const details = a('details')
      const detailText = details ? details.charAt(0).toUpperCase() + details.slice(1) : ''

      events.push({
        source: SRC,
        source_id: `fasola-${a('id') || href}-${startIso.slice(0, 10)}`,
        source_url: url,
        title: `Sacred Harp singing: ${name}`,
        description: [
          detailText,
          `Traditional shape-note (Sacred Harp) community singing${book ? ` from ${book}` : ''}${dur > 1 ? ` over ${dur} days` : ''}.`,
          'Open to everyone, all voices welcome — no audition and no experience needed; loaner books are usually available. All-day singings traditionally share a potluck "dinner on the grounds" at noon.',
        ].filter(Boolean).join(' ').slice(0, 1200),
        organizer: 'Sacred Harp / shape-note singing community',
        location_name: locParts.join(', ') || `${city}, ${country}`,
        lat,
        lng,
        starts_at: startIso,
        ends_at: endIso,
        cost: 'Free (donations welcome)',
      })
    }

    events.sort((x, y) => x.starts_at.localeCompare(y.starts_at))
    return events.slice(0, MAX_EVENTS)
  },
}
