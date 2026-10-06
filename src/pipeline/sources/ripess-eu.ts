/**
 * RIPESS Europe — ripess.eu
 * Solidarity economy networks across Europe: congresses, social forums, SSE
 * fairs and gatherings that the network lists in its agenda.
 *
 * The agenda (ripess.eu/en/agenda/) is The Events Calendar, so we read its
 * REST API: /wp-json/tribe/events/v1/events (future events only). A handful
 * of events a year. Venues carry city + country but no coordinates, so they
 * are geocoded (Nominatim, cached). Wall-clock times are re-anchored to the
 * venue country's zone (the site's own zone is Europe/Paris for everything);
 * events without a venue (webinars) or flagged online are skipped.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getJson, geocodeEuFirst, tzForCountry, zonedIso, ONLINE_RE, COUNTRY_CC } from './eu-common'

const SRC = 'ripess-eu'
const API = 'https://ripess.eu/wp-json/tribe/events/v1/events'

function wall(s: string): [number, number, number, number, number] | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  return m ? [+m[1], +m[2], +m[3], +m[4], +m[5]] : null
}

export const ripessEu: SourceFetcher = {
  name: SRC,
  async fetch() {
    const today = new Date().toISOString().slice(0, 10)
    const events: RawEvent[] = []
    let url: string | null = `${API}?per_page=50&start_date=${today}`
    for (let page = 0; url && page < 4; page++) {
      const d: any = await getJson(url)
      if (!d?.events) break
      for (const e of d.events as any[]) {
        const title = stripHtml(e.title ?? '')
        const v = e.venue && !Array.isArray(e.venue) ? e.venue : null
        if (!title || !v?.city) continue
        const desc = stripHtml(e.description ?? '')
        if (ONLINE_RE.test(`${v.venue ?? ''} ${v.city ?? ''}`) || /^online\b/i.test(title)) continue

        const cc = COUNTRY_CC[String(v.country ?? '').trim().toLowerCase()]
        const tz = tzForCountry(v.country) ?? e.timezone ?? 'Europe/Paris'
        const s = wall(e.start_date ?? '')
        if (!s) continue
        const starts = e.all_day ? zonedIso(tz, s[0], s[1], s[2], 10, 0) : zonedIso(tz, ...s)
        if (!starts) continue
        const en = wall(e.end_date ?? '')
        let ends = en ? (e.all_day ? zonedIso(tz, en[0], en[1], en[2], 18, 0) : zonedIso(tz, ...en)) : null
        if (ends && ends <= starts) ends = null

        const lat = parseFloat(v.geo_lat ?? '')
        const lng = parseFloat(v.geo_lng ?? '')
        let loc = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null
        if (!loc) {
          loc = await geocodeEuFirst(
            [[v.venue, v.city, v.country].filter(Boolean).join(', '), [v.city, v.country].filter(Boolean).join(', ')],
            cc,
          )
        }
        if (!loc) continue

        events.push({
          source: SRC,
          source_id: `ripess-${e.id}`,
          source_url: e.url ?? 'https://ripess.eu/en/agenda/',
          title,
          description: desc.slice(0, 500) || `${title} — listed in the RIPESS Europe solidarity economy agenda.`,
          organizer: stripHtml(e.organizer?.[0]?.organizer ?? '') || 'RIPESS Europe',
          location_name: [v.venue, v.city, v.country].filter(Boolean).map((x: string) => stripHtml(x)).join(', '),
          lat: loc.lat,
          lng: loc.lng,
          starts_at: starts,
          ends_at: ends,
          cost: e.cost ? stripHtml(e.cost) : 'See event page',
          image_url: e.image?.url ?? null,
        })
      }
      url = d.next_rest_url ?? null
    }
    return events
  },
}
