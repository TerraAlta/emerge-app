/** The Session — thesession.org — Irish traditional music sessions worldwide */
import type { RawEvent, SourceFetcher } from './types'
import { hashStr } from './utils'

/**
 * The Session has a public JSON API for sessions (pub-based trad music meetups).
 * Endpoint: https://thesession.org/sessions/search?latlon=LAT,LNG&radius=50&format=json&perpage=50
 * Returns sessions with location, day of week, and venue details.
 */

import { CITIES } from './cities'

/** Pick a representative subset of cities to avoid hammering the API */
const SESSION_CITIES = CITIES.filter(c =>
  ['United Kingdom', 'Ireland', 'France', 'Germany', 'Netherlands', 'Belgium',
   'USA', 'Canada', 'Spain', 'Italy', 'Denmark', 'Scotland', 'Iceland'].includes(c.country)
).filter((_, i) => i % 3 === 0) // Every 3rd city — ~65 cities

export const theSessionGlobal: SourceFetcher = {
  name: 'thesession-global',
  async fetch() {
    const all: RawEvent[] = []
    for (const city of SESSION_CITIES) {
      try {
        const url = `https://thesession.org/sessions/search?latlon=${city.lat},${city.lng}&radius=50&format=json&perpage=50`
        const r = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'Emerge/1.0 (regenerative community quest app)' },
          signal: AbortSignal.timeout(12000),
        })
        if (!r.ok) continue
        const data = await r.json()
        const sessions = data.sessions ?? []
        for (const s of sessions) {
          const venue = s.venue?.name ?? 'Local venue'
          const venueLat = parseFloat(s.venue?.latitude ?? city.lat)
          const venueLng = parseFloat(s.venue?.longitude ?? city.lng)
          const day = s.schedule ?? 'Weekly'
          // Sessions are recurring — create a next-occurrence date
          const nextDate = nextOccurrence(day)
          if (!nextDate) continue
          all.push({
            source: 'thesession-global',
            source_id: `ts-${s.id ?? hashStr(venue + day)}`,
            source_url: s.id ? `https://thesession.org/sessions/${s.id}` : null,
            title: `Irish Trad Session at ${venue}`,
            description: `Weekly traditional Irish music session. ${day}. All musicians welcome — bring your instrument or just come and listen. ${s.contact ?? ''}`.trim(),
            organizer: s.contact ?? 'The Session community',
            location_name: `${venue}, ${city.name}`,
            lat: venueLat,
            lng: venueLng,
            starts_at: nextDate.toISOString(),
            cost: 'Free',
          })
        }
        // Rate limit
        await new Promise(r => setTimeout(r, 1200))
      } catch { continue }
    }
    return all
  },
}

/** Given a day name like "Monday" or "every Wednesday", return the next occurrence */
function nextOccurrence(schedule: string): Date | null {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const lower = (schedule ?? '').toLowerCase()
  const dayIdx = days.findIndex(d => lower.includes(d))
  if (dayIdx === -1) return null
  const now = new Date()
  const today = now.getDay()
  let diff = dayIdx - today
  if (diff <= 0) diff += 7
  const next = new Date(now)
  next.setDate(now.getDate() + diff)
  next.setHours(20, 0, 0, 0) // Sessions typically start around 8pm
  return next
}
