/**
 * Comhaltas Ceoltóirí Éireann — traditional Irish music events (comhaltas.ie)
 *
 * Events are Eventin ("etn") posts. The Eventin calendar API needs a logged-in
 * nonce, but the posts themselves are public in the standard WP REST API
 * (/wp-json/wp/v2/etn, newest first), and every event page carries a
 * schema.org Event JSON-LD block with startDate/endDate (with UTC offset),
 * attendance mode and a Place with coordinates.
 *
 * We list events published in the last ~9 months (≤ 30), open up to 20 of
 * their pages and keep the upcoming in-person ones. Without coordinates the
 * venue is geocoded (Ireland / UK); events that can't be placed are skipped.
 * Most Comhaltas events are announced a few weeks ahead, so this source is
 * often empty between festival seasons.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, getJson, geocodeFirst, ONLINE_RE, type LatLng } from './misc-common'

const SRC = 'comhaltas-ie'
const API = 'https://comhaltas.ie/wp-json/wp/v2/etn'
const MAX_DETAIL = 20

interface EtnPost { id: number; link: string; date: string; title?: { rendered?: string } }

function jsonLdEvent(html: string): any | null {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const d = JSON.parse(m[1].trim())
      const items = Array.isArray(d) ? d : d['@graph'] ?? [d]
      const ev = items.find((i: any) => i?.['@type'] === 'Event')
      if (ev) return ev
    } catch { /* next */ }
  }
  return null
}

export const comhaltasIe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const after = new Date(Date.now() - 270 * 864e5).toISOString().slice(0, 19)
    const posts = await getJson<EtnPost[]>(`${API}?per_page=30&orderby=date&order=desc&after=${after}&_fields=id,link,date,title`)
    if (!Array.isArray(posts)) return []
    const now = Date.now()
    const out: RawEvent[] = []

    for (const p of posts.slice(0, MAX_DETAIL)) {
      if (!/^https:\/\/comhaltas\.ie\//.test(p.link)) continue
      const html = await getText(p.link)
      if (!html) continue
      const ev = jsonLdEvent(html)
      if (!ev?.startDate || !ev.name) continue
      // startDate carries its offset ("2026-07-21T14:30:00+01:00"); a bare date is not trusted
      if (!/T\d{2}:\d{2}/.test(ev.startDate) || !/(Z|[+-]\d{2}:?\d{2})$/.test(ev.startDate)) continue
      const startMs = Date.parse(ev.startDate)
      if (!Number.isFinite(startMs) || startMs < now + 3600_000) continue
      if (/OnlineEventAttendanceMode/i.test(ev.eventAttendanceMode ?? '')) continue
      if (/EventCancelled|EventPostponed/i.test(ev.eventStatus ?? '')) continue

      const place = Array.isArray(ev.location) ? ev.location[0] : ev.location
      const locName = stripHtml(place?.name ?? place?.address?.streetAddress ?? '')
      if (!locName || ONLINE_RE.test(locName)) continue
      let geo: LatLng | null = null
      const lat = parseFloat(place?.geo?.latitude)
      const lng = parseFloat(place?.geo?.longitude)
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) geo = { lat, lng }
      if (!geo) geo = await geocodeFirst([locName, locName.split(',').slice(-2).join(',')], 'ie,gb')
      if (!geo) continue

      const endMs = ev.endDate ? Date.parse(ev.endDate) : NaN
      const title = stripHtml(ev.name)
      out.push({
        source: SRC,
        source_id: `cce-${p.id}-${new Date(startMs).toISOString().slice(0, 10)}`,
        source_url: p.link,
        title,
        description: stripHtml(ev.description ?? '').slice(0, 500) || `${title} — Comhaltas Ceoltóirí Éireann.`,
        organizer: 'Comhaltas Ceoltóirí Éireann',
        location_name: locName,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: new Date(startMs).toISOString(),
        ends_at: Number.isFinite(endMs) && endMs > startMs ? new Date(endMs).toISOString() : null,
        cost: 'See event page',
        image_url: typeof ev.image === 'string' ? ev.image : null,
      })
    }
    return out
  },
}
