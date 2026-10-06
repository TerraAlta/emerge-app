/**
 * The Orchard Project — theorchardproject.org.uk — community orchard harvest
 * days, apple days, pruning workshops and accredited courses.
 *
 * The site (Genesis/WordPress, no Events Calendar, no JSON-LD) shows an
 * "Upcoming events" block at /events/ — each card links to the event page and
 * shows the date ("Saturday 17 October 2026") and venue with postcode. The
 * event page adds "Time: 2pm-5pm". The "Recent Events" list below it is past
 * events and is ignored.
 *
 * Coordinates come from the venue postcode via postcodes.io (free, keyless);
 * events whose venue can't be placed are skipped.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, decodeEntities } from './utils'

const SRC = 'orchard-project-uk'
const BASE = 'https://www.theorchardproject.org.uk'
// The host's WAF answers 403 to any UA containing "(compatible;"; this one
// still identifies us honestly.
const UA = 'Emerge-App/1.0'
const MAX_EVENTS = 10 // each costs a page fetch + a geocode

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}
const ONLINE_RX = /\b(online|zoom|webinar|virtual)\b/i
const POSTCODE_RX = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

async function get(url: string, accept = 'text/html'): Promise<Response | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(20000) })
    return r.ok ? r : null
  } catch { return null }
}

function lastSunday(y: number, m: number): number {
  const d = new Date(Date.UTC(y, m + 1, 0))
  return d.getUTCDate() - d.getUTCDay()
}

/** UK wall-clock time → ISO string (handles BST). */
function londonIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const asUtc = Date.UTC(y, mo, d, h, mi)
  const bstStart = Date.UTC(y, 2, lastSunday(y, 2), 1)
  const bstEnd = Date.UTC(y, 9, lastSunday(y, 9), 1)
  const offset = asUtc - 3600000 >= bstStart && asUtc - 3600000 < bstEnd ? 1 : 0
  return new Date(asUtc - offset * 3600000).toISOString()
}

/** "Saturday 17 October 2026" / "17th Oct 2026" → [y, m, d] (year required). */
function parseDay(s: string): [number, number, number] | null {
  const m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/)
  if (!m) return null
  const key = Object.keys(MONTHS).find(k => k.startsWith(m[2].toLowerCase().slice(0, 3)))
  return key ? [parseInt(m[3]), MONTHS[key], parseInt(m[1])] : null
}

/** "2pm", "10.30am", "14:00" → [h, m] */
function parseTime(s: string): [number, number] | null {
  const m = s.trim().match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?/i)
  if (!m || (!m[2] && !m[3])) return null
  let h = parseInt(m[1])
  const mi = m[2] ? parseInt(m[2]) : 0
  const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return h <= 23 && mi <= 59 ? [h, mi] : null
}

async function geocode(venue: string): Promise<{ lat: number; lng: number } | null> {
  const pc = venue.match(POSTCODE_RX)
  if (pc) {
    const r = await get(`https://api.postcodes.io/postcodes/${encodeURIComponent(`${pc[1]} ${pc[2]}`)}`, 'application/json')
    const d = r ? await r.json().catch(() => null) : null
    const lat = Number(d?.result?.latitude), lng = Number(d?.result?.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng) && d?.result?.latitude != null) return { lat, lng }
  }
  // No postcode: try the last place-name segment of the venue ("…, Edinburgh").
  const place = venue.split(',').map(s => s.trim()).filter(s => s && !/\d/.test(s)).pop()
  if (place) {
    const r = await get(`https://api.postcodes.io/places?q=${encodeURIComponent(place)}&limit=1`, 'application/json')
    const d = r ? await r.json().catch(() => null) : null
    const p = d?.result?.[0]
    if (p && Number.isFinite(Number(p.latitude))) return { lat: Number(p.latitude), lng: Number(p.longitude) }
  }
  return null
}

export const orchardProjectUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    const res = await get(`${BASE}/events/`)
    if (!res) return []
    const $ = load(await res.text())

    const cards: { url: string; title: string; date: string; venue: string }[] = []
    $('.upcoming-events-list a.stretched-link').each((_, el) => {
      const a = $(el)
      const url = a.attr('href')
      const card = a.nextAll('.row').first()
      const title = stripHtml(card.find('h4').first().html() ?? a.text())
      if (!url || !title) return
      cards.push({
        url,
        title,
        date: stripHtml(card.find('.event-list-date').first().html() ?? ''),
        venue: stripHtml(card.find('.event-list-location').first().html() ?? ''),
      })
    })

    const events: RawEvent[] = []
    for (const c of cards.slice(0, MAX_EVENTS)) {
      if (ONLINE_RX.test(c.title) || ONLINE_RX.test(c.venue)) continue

      const page = await get(c.url)
      const html = page ? await page.text() : ''
      const d$ = load(html)
      const main = d$('main .entry-content').first()
      // Keep line breaks so "Date: …" / "Time: …" lines can be read one by one.
      const text = decodeEntities((main.html() ?? '')
        .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n')
        .replace(/<[^>]*>/g, ''))
        .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
      const field = (label: string) =>
        (text.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'))?.[1] ?? '').trim()

      const dateStr = field('Date') || c.date
      const day = parseDay(dateStr) ?? parseDay(c.date)
      if (!day) continue
      const venue = field('Venue') || c.venue
      if (ONLINE_RX.test(venue)) continue

      const [t0, t1] = field('Time').split(/\s*(?:-|–|—|to)\s*/i)
      const st = t0 ? parseTime(t0) : null
      const et = t1 ? parseTime(t1) : null
      // "2-5pm": the start inherits the end's am/pm
      let sh = st
      if (!st && t0 && /^\d{1,2}$/.test(t0.trim()) && et) {
        const h = parseInt(t0); sh = [et[0] >= 12 && h < 12 ? h + 12 : h, 0]
      }
      const [h, mi] = sh ?? [10, 0] // date is real; no clock time given → 10:00
      const starts_at = londonIso(day[0], day[1], day[2], h, mi)
      const ends_at = et ? londonIso(day[0], day[1], day[2], et[0], et[1]) : null

      const loc = await geocode(venue)
      if (!loc) continue

      const desc = text.replace(/\b(Date|Time|Venue|What3words):[^\n]*\n?/gi, ' ').replace(/\s+/g, ' ').trim()
      events.push({
        source: SRC,
        source_id: `orch-${hashStr(c.url + starts_at)}`,
        source_url: c.url,
        title: c.title,
        description: (desc || 'Community orchard event with The Orchard Project.').slice(0, 500),
        organizer: 'The Orchard Project',
        location_name: venue || 'See event page',
        lat: loc.lat,
        lng: loc.lng,
        starts_at,
        ends_at: ends_at && ends_at > starts_at ? ends_at : null,
        cost: /\b£\s?\d/.test(desc) ? 'See event page' : 'Free',
        image_url: d$('meta[property="og:image"]').attr('content') ?? null,
      })
    }
    return events
  },
}
