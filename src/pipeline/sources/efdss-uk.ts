/**
 * EFDSS / Cecil Sharp House — efdss.org/whats-on
 * English folk dance & song: ceilidhs, barn dances, folk clubs, classes, gigs.
 *
 * The What's On page (Joomla) renders its grid client-side from a JSON array
 * embedded in the page as `var eeVents = '[...]'`. Each array item is one
 * dated occurrence with `firstEventFull` = "YYYYMMDDHHMMSS" (UK local time)
 * and `eventTimes[firstEventFull]` holding start/end. One request, no regex
 * guessing. Online sessions are skipped.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'efdss-uk'
const BASE = 'https://www.efdss.org'
const PAGE_URL = `${BASE}/whats-on`
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'

// Cecil Sharp House, 2 Regent's Park Road, London NW1 7AY
const CSH = { lat: 51.5382, lng: -0.1493 }
// Off-site venues seen in the feed (town → coords). Unknown venues are skipped.
const TOWNS: Record<string, { lat: number; lng: number }> = {
  london: CSH,
  stafford: { lat: 52.8067, lng: -2.1166 },
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

/** "8:00pm" → [20, 0] */
function parseClock(s: unknown): [number, number] | null {
  if (typeof s !== 'string') return null
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (!m) return null
  let h = +m[1] % 12
  if (m[3].toLowerCase() === 'pm') h += 12
  return [h, m[2] ? +m[2] : 0]
}

function absUrl(u: unknown): string | null {
  if (typeof u !== 'string' || !u.trim()) return null
  const s = u.trim().split('#')[0]
  try { return new URL(s, BASE + '/').toString() } catch { return null }
}

/** Extract and decode the `var eeVents = '...'` JS string literal. */
function extractEvents(html: string): any[] {
  const m = html.match(/var\s+eeVents\s*=\s*'((?:[^'\\]|\\.)*)'/)
  if (!m) return []
  try {
    // The body is a JS single-quoted literal whose only escapes are JSON-compatible
    // (\" \\/ \\n …) plus \' — turn it into a JSON string literal and decode twice.
    const jsonText = JSON.parse(`"${m[1].replace(/\\'/g, "'")}"`)
    const arr = JSON.parse(jsonText)
    return Array.isArray(arr) ? arr : []
  } catch (err) {
    console.warn(`[${SRC}] could not decode events JSON:`, (err as Error).message)
    return []
  }
}

export const efdssUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    let html: string
    try {
      const res = await fetch(PAGE_URL, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) { console.warn(`[${SRC}] ${res.status}`); return [] }
      html = await res.text()
    } catch (err) {
      console.warn(`[${SRC}] failed:`, (err as Error).message)
      return []
    }

    const items = extractEvents(html)
    const seen = new Set<string>()
    const events: RawEvent[] = []

    for (const e of items) {
      const title = stripHtml(String(e?.title ?? ''))
      const full = String(e?.firstEventFull ?? '')
      const dm = full.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/)
      if (!title || !dm) continue

      const venue = stripHtml(String(e.venue ?? ''))
      const town = stripHtml(String(e.town ?? ''))
      if (/\bonline\b/i.test(venue) || /\bonline\b/i.test(title)) continue

      let coords: { lat: number; lng: number } | undefined
      if (/cecil sharp house/i.test(venue)) coords = CSH
      else coords = TOWNS[town.toLowerCase()] ?? TOWNS[(venue.split(',').pop() ?? '').trim().toLowerCase()]
      if (!coords) continue // can't place it honestly

      const [y, mo, d, h, mi] = [+dm[1], +dm[2], +dm[3], +dm[4], +dm[5]]
      const startsAt = ukLocalToIso(y, mo, d, h, mi)
      let endsAt: string | null = null
      const endClock = parseClock(e.eventTimes?.[full]?.end)
      if (endClock) {
        const iso = ukLocalToIso(y, mo, d, endClock[0], endClock[1])
        endsAt = iso > startsAt ? iso : null
      }

      const key = `${e.id}-${full}`
      if (seen.has(key)) continue
      seen.add(key)

      const link = absUrl(e.link)
      events.push({
        source: SRC,
        source_id: `efdss-${e.id ?? hashStr(title)}-${full.slice(0, 12)}`,
        source_url: link ?? PAGE_URL,
        title,
        description: stripHtml(String(e.text ?? '')).slice(0, 500) ||
          'English Folk Dance and Song Society event.',
        organizer: 'EFDSS / Cecil Sharp House',
        location_name: [venue, town].filter(Boolean).join(', ') || 'Cecil Sharp House, London',
        lat: coords.lat,
        lng: coords.lng,
        starts_at: startsAt,
        ends_at: endsAt,
        cost: 'See event page',
        image_url: absUrl(e.imagesrc ?? e.image),
      })
    }
    return events
  },
}
