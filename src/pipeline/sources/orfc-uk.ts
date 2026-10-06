/**
 * Oxford Real Farming Conference — orfc.org.uk/events
 * The annual conference in Oxford (January) plus "ORFC in the Field" events
 * at agroecological farms in spring/summer.
 *
 * The site has no events API, so we read the /events/ listing (server-rendered
 * cards marked `event-list-item--upcoming`, with "7th January - 8th January 2027"
 * dates) and fetch each upcoming event's page for its og:description and, for
 * farm events, a postcode to place it. Online-only events are skipped.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'orfc-uk'
const BASE = 'https://orfc.org.uk'
const LIST_URL = `${BASE}/events/`
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
const MAX_DETAIL_FETCHES = 12

// The conference is spread over venues in central Oxford (Examination Schools, Town Hall…)
const OXFORD = { lat: 51.7522, lng: -1.2565, name: 'Oxford city centre, Oxford' }
// Farms that have hosted "ORFC in the Field" (matched against the title)
const FARMS: Array<[RegExp, number, number, string]> = [
  [/henbant/i, 53.0743, -4.2996, 'Henbant, Gwynedd, Wales'],
  [/fernhill/i, 51.3090, -2.6940, 'Fernhill Farm, Mendip Hills, Somerset'],
  [/wakelyns/i, 52.3530, 1.3240, 'Wakelyns, Fressingfield, Suffolk'],
  [/organiclea/i, 51.6370, -0.0040, 'OrganicLea, Chingford, London'],
  [/hill top farm/i, 53.6900, -1.9900, 'Hill Top Farm'],
]

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

/** "7th January" / "8th January 2027" → parts (year may be missing) */
function parseDay(s: string): { d: number; mo: number; y: number | null } | null {
  const m = s.trim().match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?$/)
  if (!m) return null
  const mo = MONTHS[m[2].toLowerCase()]
  if (!mo) return null
  return { d: +m[1], mo, y: m[3] ? +m[3] : null }
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json' },
      signal: AbortSignal.timeout(20000),
    })
    return res.ok ? await res.text() : null
  } catch (err) {
    console.warn(`[${SRC}] ${url} failed:`, (err as Error).message)
    return null
  }
}

/** Free, keyless UK postcode lookup (postcodes.io). */
async function geocodePostcode(pc: string): Promise<{ lat: number; lng: number } | null> {
  const txt = await getText(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`)
  if (!txt) return null
  try {
    const r = JSON.parse(txt)?.result
    if (typeof r?.latitude === 'number' && typeof r?.longitude === 'number') return { lat: r.latitude, lng: r.longitude }
  } catch { /* ignore */ }
  return null
}

export const orfcUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(LIST_URL)
    if (!html) return []
    const $ = load(html)

    const cards: Array<{ url: string; title: string; start: { y: number; mo: number; d: number }; end: { y: number; mo: number; d: number } | null; image: string | null }> = []
    $('.event-list-item--upcoming').each((_, el) => {
      const card = $(el)
      const a = card.find('h2 a').first()
      const url = a.attr('href')
      const title = stripHtml(a.text())
      const dates = card.find('.event-list-item__time .date').map((_, d) => stripHtml($(d).text())).get()
      if (!url || !title || !dates.length) return
      const s = parseDay(dates[0])
      const e = dates[1] ? parseDay(dates[1]) : null
      if (!s) return
      const endYear = e?.y ?? s.y
      if (!endYear) return // no year anywhere → skip rather than guess
      // Start year: its own, else the end's (minus one if it wraps over New Year)
      const startYear = s.y ?? (e && s.mo > e.mo ? endYear - 1 : endYear)
      cards.push({
        url: new URL(url, BASE).toString(),
        title,
        start: { y: startYear, mo: s.mo, d: s.d },
        end: e ? { y: endYear, mo: e.mo, d: e.d } : null,
        image: card.find('img').attr('src') ?? null,
      })
    })

    const events: RawEvent[] = []
    let detailFetches = 0
    for (const c of cards) {
      let desc = ''
      let pageText = ''
      if (detailFetches < MAX_DETAIL_FETCHES) {
        detailFetches++
        const page = await getText(c.url)
        if (page) {
          const $p = load(page)
          desc = stripHtml($p('meta[property="og:description"]').attr('content') ?? '')
          pageText = stripHtml($p('main').text() || $p('body').text())
        }
      }
      if (/\bonline[- ]only\b/i.test(`${c.title} ${pageText.slice(0, 600)}`)) continue

      let place: { lat: number; lng: number; name: string } | null = null
      if (/real farming conference/i.test(c.title)) place = OXFORD
      for (const [rx, lat, lng, name] of FARMS) if (!place && rx.test(c.title)) place = { lat, lng, name }
      if (!place) {
        const pc = pageText.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/)?.[1]
        const g = pc ? await geocodePostcode(pc) : null
        if (g) place = { ...g, name: pc! }
      }
      if (!place) continue // nowhere honest to put it

      // Conference days start ~09:00; farm events likewise begin in the morning
      const startsAt = ukLocalToIso(c.start.y, c.start.mo, c.start.d, 9, 0)
      const endsAt = c.end ? ukLocalToIso(c.end.y, c.end.mo, c.end.d, 17, 30) : null

      events.push({
        source: SRC,
        source_id: `orfc-${hashStr(c.url)}`,
        source_url: c.url,
        title: c.title,
        description: (desc || 'Oxford Real Farming Conference — agroecology, regenerative farming and food sovereignty.').slice(0, 500),
        organizer: 'Oxford Real Farming Conference',
        location_name: place.name,
        lat: place.lat,
        lng: place.lng,
        starts_at: startsAt,
        ends_at: endsAt && endsAt > startsAt ? endsAt : null,
        cost: 'See event page',
        image_url: c.image,
      })
    }
    return events
  },
}
