/**
 * Women's Environmental Network (Wen) — wen.org.uk
 * Gender & environmental justice: food growing, Green Baby, Environmenstrual,
 * community workshops (mostly East London / Tower Hamlets).
 *
 * wen.org.uk/events/ is only a Ticket Tailor widget. The data lives on the
 * public Ticket Tailor box offices (server-rendered):
 *   https://www.tickettailor.com/events/womensenvironmentalnetwork/
 *   https://www.tickettailor.com/events/climatesisters/
 * Each card: title + link, "Tue 6 Oct 2026 10:00 AM - 4:30 PM", location
 * line with a postcode, which we geocode with postcodes.io (free, keyless).
 * Online events (location "Online"/no postcode) are skipped.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'wen-uk'
const TT = 'https://www.tickettailor.com'
const BOX_OFFICES = ['womensenvironmentalnetwork', 'climatesisters']
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
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

function to24(h: number, mer: string): number {
  return mer.toUpperCase() === 'PM' ? (h % 12) + 12 : h % 12
}

interface Card {
  box: string
  url: string
  title: string
  location: string
  postcode: string | null
  startsAt: string
  endsAt: string | null
  image: string | null
}

/**
 * "Tue 6 Oct 2026 10:00 AM - 4:30 PM" or, for multi-day,
 * "Sat 10 Oct 2026 10:00 AM - Sun 11 Oct 2026 4:00 PM".
 */
function parseWhen(s: string): { startsAt: string; endsAt: string | null } | null {
  const re = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/gi
  const parts = [...s.matchAll(re)]
  if (parts.length === 0) return null
  const p0 = parts[0]
  const mo = MONTHS[p0[2].toLowerCase()]
  if (!mo) return null
  const startsAt = londonIso(+p0[3], mo, +p0[1], to24(+p0[4], p0[6]), +p0[5])
  let endsAt: string | null = null
  if (parts[1]) {
    const p1 = parts[1]
    const mo1 = MONTHS[p1[2].toLowerCase()]
    if (mo1) endsAt = londonIso(+p1[3], mo1, +p1[1], to24(+p1[4], p1[6]), +p1[5])
  } else {
    const endTime = s.slice((p0.index ?? 0) + p0[0].length).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
    if (endTime) endsAt = londonIso(+p0[3], mo, +p0[1], to24(+endTime[1], endTime[3]), +endTime[2])
  }
  return { startsAt, endsAt: endsAt && endsAt > startsAt ? endsAt : null }
}

async function geocode(pcs: string[]): Promise<Map<string, [number, number]>> {
  const out = new Map<string, [number, number]>()
  if (pcs.length === 0) return out
  try {
    const res = await fetch('https://api.postcodes.io/postcodes', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: pcs.slice(0, 100) }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return out
    for (const r of (await res.json()).result ?? []) {
      if (r.result?.latitude && r.result?.longitude) out.set(r.query, [r.result.latitude, r.result.longitude])
    }
  } catch { /* ignore */ }
  return out
}

export const wenUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    const cards: Card[] = []
    for (const box of BOX_OFFICES) {
      try {
        const res = await fetch(`${TT}/events/${box}/`, {
          headers: { 'User-Agent': UA, Accept: 'text/html' },
          signal: AbortSignal.timeout(20000),
        })
        if (!res.ok) continue
        const $ = load(await res.text())
        $('.events-listing__item').each((_, li) => {
          const el = $(li)
          const a = el.find('a.event__link').first()
          const title = stripHtml(a.text())
          const href = a.attr('href')
          const when = parseWhen(el.find('.event-meta__date').text().replace(/\s+/g, ' '))
          if (!title || !href || !when) return
          const location = el.find('.event-meta__location').text().replace(/\s+/g, ' ').trim()
          if (/\bonline\b|zoom|virtual/i.test(location) || /\b(online|webinar|zoom)\b/i.test(title)) return
          const pc = location.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i)
          cards.push({
            box,
            url: new URL(href, TT).toString(),
            title,
            location,
            postcode: pc ? `${pc[1]} ${pc[2]}`.toUpperCase() : null,
            ...when,
            image: el.find('.event__image img').attr('src') ?? null,
          })
        })
      } catch (err) {
        console.warn(`[${SRC}] ${box} failed:`, (err as Error).message)
      }
    }

    const coords = await geocode([...new Set(cards.map((c) => c.postcode).filter((p): p is string => !!p))])
    const events: RawEvent[] = []
    for (const c of cards) {
      const ll = c.postcode ? coords.get(c.postcode) : undefined
      if (!ll) continue // no postcode → can't place it; don't guess
      events.push({
        source: SRC,
        source_id: `wen-${c.url.match(/\/(\d+)\/?$/)?.[1] ?? hashStr(c.title + c.startsAt)}`,
        source_url: c.url,
        title: c.title,
        description: c.box === 'climatesisters'
          ? 'Climate Sisters (Wen) — feminist climate action event.'
          : "Women's Environmental Network event — gender and environmental justice, community food growing and toxic-free living.",
        organizer: c.box === 'climatesisters' ? "Climate Sisters (Women's Environmental Network)" : "Women's Environmental Network",
        location_name: c.location,
        lat: ll[0],
        lng: ll[1],
        starts_at: c.startsAt,
        ends_at: c.endsAt,
        cost: 'See event page',
        image_url: c.image,
      })
    }
    return events
  },
}
