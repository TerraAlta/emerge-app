/**
 * UK Cohousing Network — cohousing.org.uk
 * National network for cohousing communities. Summits, regional evenings,
 * open days and Cohousing Cafés.
 *
 * There's no events plugin: events are ordinary WordPress posts in the
 * "events" category (id 226), read via /wp-json/wp/v2/posts. The date, time
 * and venue are written as the first line of the post body, e.g.
 *   "Thursday 1st October | 6-9pm | Pollard Thomas Edwards, London, England"
 *   "Tuesday 15 September • 10 AM – 4 PM"
 * with no year, so the year is inferred from the post's publish date (the
 * first such date on/after publication). Online Cafés are skipped; venues
 * are geocoded with postcodes.io (postcode, else town name), and events we
 * can't place are skipped. Low volume: a handful of in-person events a year.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities } from './utils'

const SRC = 'cohousing-uk'
const API = 'https://cohousing.org.uk/wp-json/wp/v2/posts?categories=226&per_page=20&_fields=id,date,link,title,content,excerpt'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
const MAX_GEOCODE = 15

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
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

/** "6-9pm", "10 AM – 4 PM", "19:00–20:30" → [startH, startM, endH, endM] */
function parseTimes(s: string): [number, number, number | null, number] | null {
  const to24 = (h: number, mer?: string) => (!mer ? h : mer.toLowerCase() === 'pm' ? (h % 12) + 12 : h % 12)
  const m = s.match(/(\d{1,2})(?:[:.](\d\d))?\s*(am|pm)?\s*(?:–|-|—|to)\s*(\d{1,2})(?:[:.](\d\d))?\s*(am|pm)?/i)
  if (m) {
    const endMer = m[6]
    let startMer = m[3]
    if (!startMer && endMer) startMer = endMer.toLowerCase() === 'pm' && +m[1] % 12 > +m[4] % 12 ? 'am' : endMer
    return [to24(+m[1], startMer), +(m[2] ?? 0), to24(+m[4], endMer), +(m[5] ?? 0)]
  }
  const one = s.match(/(\d{1,2})(?:[:.](\d\d))?\s*(am|pm)/i)
  return one ? [to24(+one[1], one[3]), +(one[2] ?? 0), null, 0] : null
}

async function geocode(venue: string): Promise<[number, number] | null> {
  const get = async (url: string) => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
      return res.ok ? await res.json() : null
    } catch {
      return null
    }
  }
  const pc = venue.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/)
  if (pc) {
    const r = (await get(`https://api.postcodes.io/postcodes/${encodeURIComponent(`${pc[1]} ${pc[2]}`)}`))?.result
    if (r?.latitude) return [r.latitude, r.longitude]
  }
  // Try place names from most to least specific-but-geocodable: "…, Cardiff, Wales" → Cardiff
  const parts = venue.split(',').map((p) => p.replace(/[.’']/g, '').trim())
    .filter((p) => p && !/^(england|wales|scotland|northern ireland|uk|united kingdom)$/i.test(p))
  for (const part of parts.reverse()) {
    const r = (await get(`https://api.postcodes.io/places?q=${encodeURIComponent(part)}&limit=1`))?.result?.[0]
    if (r?.latitude) return [r.latitude, r.longitude]
  }
  return null
}

export const cohousingUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    let posts: any[]
    try {
      const res = await fetch(API, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) {
        console.warn(`[${SRC}] API HTTP ${res.status}`)
        return []
      }
      posts = await res.json()
    } catch (err) {
      console.warn(`[${SRC}] API failed:`, (err as Error).message)
      return []
    }

    const events: RawEvent[] = []
    let geocodes = 0
    for (const p of posts) {
      const published = new Date(p.date)
      if (isNaN(published.getTime())) continue
      // Old posts can't describe upcoming events
      if (Date.now() - published.getTime() > 400 * 864e5) continue

      const lines = decodeEntities(String(p.content?.rendered ?? '').replace(/<\/(p|h\d|div|li)>|<br\s*\/?>/gi, '\n'))
        .replace(/<[^>]+>/g, '')
        .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
        .slice(0, 8)
      // First line that starts with "<Weekday> <day> <Month>"
      let when: RegExpMatchArray | null = null
      let line = ''
      for (const l of lines) {
        when = l.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/i)
        if (when) { line = l; break }
      }
      if (!when) continue
      const mo = MONTHS[when[2].toLowerCase()]
      if (!mo) continue
      const day = +when[1]

      const segs = line.split(/\s*[|•]\s*/)
      if (segs.some((s) => /^(online|zoom|virtual)\b/i.test(s)) || /\b(online|zoom|webinar)\b/i.test(line)) continue
      const times = parseTimes(segs.slice(1).join(' ') || line)
      const venue = segs.slice(1).find((s) => !parseTimes(s) && /[A-Za-z]{3}/.test(s))?.replace(/\.$/, '') ?? ''
      if (!venue) continue // no stated venue (e.g. TBC) → can't place it

      let year = when[3] ? +when[3] : published.getUTCFullYear()
      if (!when[3] && Date.UTC(year, mo - 1, day) < published.getTime() - 7 * 864e5) year += 1

      const [sh, sm, eh, em] = times ?? [10, 0, null, 0]
      const startsAt = londonIso(year, mo, day, sh, sm)
      if (new Date(startsAt).getTime() < Date.now()) continue

      if (geocodes >= MAX_GEOCODE) break
      geocodes++
      const ll = await geocode(venue)
      if (!ll) continue

      const endsAt = eh !== null ? londonIso(year, mo, day, eh, em) : null
      const body = lines.filter((l) => l !== line).join(' ')
      events.push({
        source: SRC,
        source_id: `ch-${p.id}`,
        source_url: p.link ?? null,
        title: stripHtml(p.title?.rendered ?? ''),
        description: stripHtml(body).slice(0, 500),
        organizer: 'UK Cohousing Network',
        location_name: venue,
        lat: ll[0],
        lng: ll[1],
        starts_at: startsAt,
        ends_at: endsAt && endsAt > startsAt ? endsAt : null,
        cost: 'See event page',
      })
    }
    return events
  },
}
