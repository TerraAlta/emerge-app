/**
 * Navdanya / Vandana Shiva — Earth University (Bija Vidyapeeth)
 * Residential courses on seed sovereignty, agroecology, ecofeminism and
 * Earth democracy at the Navdanya biodiversity farm, Ramgarh, Dehradun (India).
 *
 * Source: https://navdanya.org/earth-university/ — "Learning @ Navdanya" list
 * (Elementor premium bullet list):
 *   <span class="premium-bullet-text">Economic Freedom &amp; Self Reliance</span>
 *   <span class="premium-bullet-list-desc">13th November 2026(Fri)- 17th November 2026(Tues)</span>
 *   <a class="premium-bullet-list-link" href="…programme page…">   (optional)
 * Dates are date-only → 10:00 IST (Asia/Kolkata, UTC+5:30). All programmes run
 * at the farm → fixed coordinates (OSM node "Navdanya", Ramgarh).
 * (vandanashiva.com has no events page any more; navdanya.org/events is gone.)
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities } from './utils'
import { getText, zonedIso, MONTHS, ONLINE_RE } from './global-common'

const SRC = 'navdanya-global'
const URL = 'https://navdanya.org/earth-university/'
const LAT = 30.3266, LNG = 77.8752 // Navdanya farm, Ramgarh, Dehradun (OSM)
const TZ = 'Asia/Kolkata'

const DATE_RE = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s*(\d{4})?/g

function parseDates(s: string): { y: number; m: number; d: number }[] {
  const out: { y: number; m: number; d: number }[] = []
  const found = [...s.matchAll(DATE_RE)]
    .map((m) => ({ d: +m[1], m: MONTHS[m[2].toLowerCase()] ?? MONTHS[m[2].toLowerCase().slice(0, 3)], y: m[3] ? +m[3] : 0 }))
    .filter((x) => x.m && x.d >= 1 && x.d <= 31)
  // Fill a missing year from the next date that has one ("03rd October (Sat) - 16th October 2026")
  for (let i = found.length - 1; i >= 0; i--) {
    if (!found[i].y) {
      const next = found.slice(i + 1).find((x) => x.y)
      if (!next) continue
      found[i].y = found[i].m > next.m ? next.y - 1 : next.y
    }
    out.unshift(found[i])
  }
  return out.filter((x) => x.y)
}

export const navdanyaGlobal: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(URL)
    if (!html) return []
    const now = Date.now()
    const events: RawEvent[] = []
    const items = html.split(/<li class="premium-bullet-list-content/).slice(1)
    for (const raw of items) {
      const item = raw.split('</li>')[0]
      const title = stripHtml(item.match(/class="premium-bullet-text"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '')
      const when = decodeEntities(item.match(/class="premium-bullet-list-desc"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '').trim()
      if (!title || !when) continue
      if (ONLINE_RE.test(`${title} ${when}`)) continue
      const dates = parseDates(when)
      if (!dates.length) continue
      const s = dates[0]
      const startIso = zonedIso(s.y, s.m, s.d, 10, 0, TZ)
      if (!startIso || Date.parse(startIso) < now + 3600_000) continue
      const e = dates.length > 1 ? dates[dates.length - 1] : null
      const endIso = e ? zonedIso(e.y, e.m, e.d, 17, 0, TZ) : null
      const href = item.match(/class="premium-bullet-list-link"[^>]*href="([^"]+)"/)?.[1]
        ?? item.match(/href="([^"]+)"[^>]*class="premium-bullet-list-link"/)?.[1]

      events.push({
        source: SRC,
        source_id: `navdanya-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}-${startIso.slice(0, 10)}`,
        source_url: href && /^https?:/.test(href) ? href : URL,
        title: `${title} — Navdanya Earth University`,
        description: `${title}: a programme of Navdanya's Earth University (Bija Vidyapeeth), founded by Dr Vandana Shiva, at the Navdanya biodiversity conservation farm near Dehradun — learning seed saving, agroecology, Earth democracy and living economies. Dates: ${when}.`,
        organizer: 'Navdanya — Earth University (Bija Vidyapeeth)',
        location_name: 'Navdanya Biodiversity Farm, Ramgarh, Dehradun, Uttarakhand, India',
        lat: LAT,
        lng: LNG,
        starts_at: startIso,
        ends_at: endIso && Date.parse(endIso) > Date.parse(startIso) ? endIso : null,
        cost: 'See programme page',
      })
    }
    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return events
  },
}
