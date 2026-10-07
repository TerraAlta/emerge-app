/**
 * Quinta Vale da Lama — valedalama.net — regenerative farm near Lagos
 * (Algarve): Ecosystem Regeneration Camps, agroforestry days, volunteering.
 *
 * Divi page: each activity is an <h2> title followed by a "Dates: …" line in
 * free English ("2 to 8 November 2026", "November 2, 9, 16, 23, and 30,
 * 2026"). We take the first concrete date; "By registration" is skipped.
 * Added 2026-10-07.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities, hashStr } from './utils'

const SRC = 'vale-da-lama-pt'
const PAGE = 'https://www.valedalama.net/activities-and-learning-experiences/'
const LAT = 37.1307
const LNG = -8.6336
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** First concrete day in a free-text date line, plus an end day if it's a range. */
function parseDates(text: string): { start: Date; end: Date | null } | null {
  const t = text.toLowerCase()
  const year = Number(t.match(/\b(20\d{2})\b/)?.[1])
  const mi = MONTHS.findIndex(m => t.includes(m))
  if (!year || mi < 0) return null
  const range = t.match(/\b(\d{1,2})\s+to\s+(\d{1,2})\b/)
  const firstDay = Number(range?.[1] ?? t.match(/\b(\d{1,2})\b(?!\d)/)?.[1])
  if (!firstDay || firstDay > 31) return null
  const start = new Date(Date.UTC(year, mi, firstDay, 9, 0))
  const end = range ? new Date(Date.UTC(year, mi, Number(range[2]), 17, 0)) : null
  return { start, end }
}

export const valeDaLamaPt: SourceFetcher = {
  name: SRC,
  async fetch() {
    let html: string
    try {
      const res = await fetch(PAGE, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)' }, signal: AbortSignal.timeout(30_000) })
      if (!res.ok) return []
      html = await res.text()
    } catch {
      return []
    }
    const now = Date.now()
    const events: RawEvent[] = []
    let title = ''
    for (const m of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>|Dates?:\s*([^<]+)/g)) {
      if (m[1] !== undefined) { title = decodeEntities(stripHtml(m[1])).trim(); continue }
      if (!title) continue
      const dates = parseDates(m[2])
      if (!dates || dates.start.getTime() < now) continue
      events.push({
        source: SRC,
        source_id: `${SRC}-${hashStr(title + dates.start.toISOString())}`,
        source_url: PAGE,
        title,
        description: `${title} at Quinta Vale da Lama, a regenerative farm near Lagos. Dates: ${m[2].trim()}.`,
        organizer: 'Quinta Vale da Lama',
        location_name: 'Quinta Vale da Lama, Lagos, Portugal',
        lat: LAT,
        lng: LNG,
        starts_at: dates.start.toISOString(),
        ends_at: dates.end?.toISOString() ?? null,
        cost: 'See event page',
        image_url: null,
      })
    }
    return events
  },
}
