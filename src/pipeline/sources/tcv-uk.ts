/**
 * The Conservation Volunteers (TCV) — tcv.org.uk
 * UK's leading practical conservation charity. Volunteering sessions,
 * Green Gyms, tree planting and training across the country.
 *
 * The main WordPress site has no event data. Its "Find TCV" page embeds the
 * national activity search, a Perl CGI app at www2.tcv.org.uk:
 *   /cgi-bin/volunteer/activities?search=;distance=50;c=<cat>;page=N;start=M
 * With an empty postcode it returns the whole UK, date-ordered, 10 per page.
 * Each card has date, title, group, site and description; the detail page
 *   /cgi-bin/volunteer/activity-details?id=<id>;date=<YYYY-MM-DD>
 * adds start/finish time and the site's coordinates (Google Maps LatLng).
 *
 * The national list holds ~1,000+ occurrences (~3 months) and the first
 * pages are all today's sessions, so we sample pages at spread offsets
 * (covering roughly the next 4–6 weeks) plus the first tree-planting and
 * training pages: 13 listing requests + up to 27 detail pages, one per
 * activity id (recurring sessions share an id). Occurrences whose activity
 * we couldn't get coordinates for are skipped.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'tcv-uk'
const CGI = 'https://www2.tcv.org.uk/cgi-bin/volunteer'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
const MAX_DETAIL = 27
const MAX_EVENTS = 200

// [category, start offset] — '' = all categories, 10 = Tree Planting,
// 6 = Training or workshop. 10 results per page.
const LISTINGS: Array<[string, number]> = [
  ...[30, 60, 90, 120, 160, 200, 250, 300, 360, 430].map((s): [string, number] => ['', s]),
  ['10', 0], ['10', 10], ['6', 0],
]

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
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

interface Occurrence {
  id: string
  date: string // YYYY-MM-DD
  title: string
  group: string
  site: string
  description: string
  category: string
  page: number
}

interface Detail {
  start: [number, number] | null
  end: [number, number] | null
  lat: number
  lng: number
  meeting: string
}

function parseListing(html: string): Occurrence[] {
  const $ = load(html)
  const out: Occurrence[] = []
  $('li.activity').each((_, li) => {
    const el = $(li)
    const link = el.find('a.tcv-button[href*="activity-details"]').first().attr('href')
      ?? el.nextAll('p').find('a[href*="activity-details"]').first().attr('href')
      ?? ''
    const idm = link.match(/id=(\d+)/)
    const dateTxt = el.find('.activity-date').text().replace(/\s+/g, ' ').trim()
    // "Wednesday 7th October 2026"
    const dm = dateTxt.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/)
    const title = stripHtml(el.find('.activity-details h2').first().text())
    if (!idm || !dm || !title) return
    const mo = MONTHS[dm[2].toLowerCase()]
    if (!mo) return
    const paras = el.find('.activity-details p').toArray().map((p) => $(p).text().replace(/\s+/g, ' ').trim())
    const group = (paras.find((p) => /^With /.test(p)) ?? '').replace(/^With\s+/, '')
    const site = el.find('.activity-details p strong').first().text().trim()
    const description = stripHtml(el.find('.activity-details h3').first().nextAll('p').first().html() ?? '')
    const category = (el.attr('class') ?? '').replace(/\bactivity\b/, '').trim()
    out.push({
      id: idm[1],
      date: `${dm[3]}-${String(mo).padStart(2, '0')}-${String(+dm[1]).padStart(2, '0')}`,
      title, group, site, description, category, page: 0,
    })
  })
  return out
}

function parseDetail(html: string): Detail | null {
  const ll = html.match(/LatLng\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/)
  if (!ll) return null
  const lat = parseFloat(ll[1])
  const lng = parseFloat(ll[2])
  // UK + NI bounding box sanity check
  if (!(lat > 49 && lat < 61 && lng > -9 && lng < 2.5)) return null
  const tm = (label: string): [number, number] | null => {
    const m = html.match(new RegExp(`${label}:</strong>\\s*(\\d{1,2})[:.](\\d{2})`, 'i'))
    return m ? [+m[1], +m[2]] : null
  }
  const meeting = html.match(/<h2>Meeting place<\/h2>\s*<p>([\s\S]*?)<\/p>/i)
  return {
    start: tm('Start time'),
    end: tm('Finish time'),
    lat, lng,
    meeting: meeting ? stripHtml(meeting[1]).slice(0, 200) : '',
  }
}

export const tcvUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    const occ: Occurrence[] = []
    const seenOcc = new Set<string>()
    for (const [page, [cat, start]] of LISTINGS.entries()) {
      const html = await get(`${CGI}/activities?search=;distance=50;c=${cat};page=${start / 10 + 1};start=${start}`)
      if (!html) continue
      for (const o of parseListing(html)) {
        o.page = page
        const key = `${o.id}|${o.date}`
        if (seenOcc.has(key)) continue
        seenOcc.add(key)
        occ.push(o)
      }
    }

    // Upcoming (from tomorrow, UK date), in person, in date order
    const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    const inPerson = occ
      .filter((o) => o.date >= tomorrow)
      .filter((o) => !/\b(online|zoom|webinar|virtual)\b/i.test(`${o.title} ${o.site}`))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Spend the detail budget round-robin across the sampled pages so later
    // weeks (and the tree-planting/training pages) get covered too, not just
    // the first day's many sessions.
    const byPage = new Map<number, Occurrence[]>()
    for (const o of inPerson) byPage.set(o.page, [...(byPage.get(o.page) ?? []), o])
    const order: Occurrence[] = []
    for (let i = 0; order.length < inPerson.length; i++) {
      for (const list of byPage.values()) if (list[i]) order.push(list[i])
    }
    const details = new Map<string, Detail | null>()
    for (const o of order) {
      if (details.has(o.id)) continue
      if (details.size >= MAX_DETAIL) break
      const html = await get(`${CGI}/activity-details?id=${o.id};date=${o.date}`)
      details.set(o.id, html ? parseDetail(html) : null)
    }

    const events: RawEvent[] = []
    for (const o of inPerson) {
      if (events.length >= MAX_EVENTS) break
      const det = details.get(o.id)
      if (!det) continue
      const [y, mo, d] = o.date.split('-').map(Number)
      const [sh, sm] = det.start ?? [10, 0]
      const startsAt = londonIso(y, mo, d, sh, sm)
      const endsAt = det.end ? londonIso(y, mo, d, det.end[0], det.end[1]) : null
      events.push({
        source: SRC,
        source_id: `tcv-${o.id}-${o.date}`,
        source_url: `${CGI}/activity-details?id=${o.id};date=${o.date}`,
        title: o.title,
        description: [o.description, o.group ? `With ${o.group}.` : '', det.meeting ? `Meeting place: ${det.meeting}` : '']
          .filter(Boolean).join(' ').slice(0, 500),
        organizer: o.group ? `The Conservation Volunteers — ${o.group}` : 'The Conservation Volunteers',
        location_name: o.site || 'TCV activity site',
        lat: det.lat,
        lng: det.lng,
        starts_at: startsAt,
        ends_at: endsAt && endsAt > startsAt ? endsAt : null,
        cost: 'Free',
      })
    }
    return events
  },
}

