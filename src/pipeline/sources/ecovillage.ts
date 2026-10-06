/**
 * Global Ecovillage Network — GEN Europe event calendar (gen-europe.org/events/)
 *
 * GEN Europe runs the network's shared calendar of ecovillage courses,
 * gatherings, trainings and youth exchanges across Europe on Modern Events
 * Calendar (MEC). The /events/ page renders the first 12 upcoming events
 * with one schema.org Event JSON-LD block each; the rest come from MEC's
 * "load more" admin-ajax call (action=mec_list_load_more), which returns the
 * same markup + JSON-LD. (The old /activities/european-events/ URL is 404;
 * ecovillage.org's own "events" are mostly online webinars on a Voxel feed
 * with no locations, so they're not used.)
 *
 * MEC writes venue-local wall-clock times with a bogus "+00:00" offset, so
 * the offset is ignored and the time is converted from the venue's real zone
 * (country from the geocoder). Date-only → 10:00 local. Online events and
 * events already under way are skipped.
 */
import type { RawEvent, SourceFetcher } from './types'
import { hashStr, stripHtml } from './utils'
import { getText, geocodeWorldFirst, sleep, tzFor, zonedIso, ONLINE_RE, UA } from './global-net-common'

const SRC = 'ecovillage'
const PAGE = 'https://gen-europe.org/events/'
const AJAX = 'https://gen-europe.org/wp-admin/admin-ajax.php'
const MAX_LOADS = 6
const MAX_EVENTS = 200

interface LdEvent {
  name?: string
  startDate?: string
  endDate?: string
  eventAttendanceMode?: string
  eventStatus?: string
  location?: { name?: string; address?: string | { streetAddress?: string; addressLocality?: string; addressCountry?: string } }
  offers?: { price?: string; priceCurrency?: string; url?: string }
  description?: string
  image?: string
  url?: string
}

function extractLd(html: string): LdEvent[] {
  const out: LdEvent[] = []
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const raw = m[1].trim()
    let d: any
    try {
      d = JSON.parse(raw)
    } catch {
      try { d = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' ')) } catch { continue }
    }
    const items = Array.isArray(d) ? d : d?.['@graph'] ?? [d]
    for (const it of items) if (it?.['@type'] === 'Event') out.push(it)
  }
  return out
}

/** "2026-10-12" or "2026-08-16T18:00:00+00:00" (local wall clock) */
function parseLocal(s: string | undefined): { y: number; mo: number; d: number; h: number; mi: number; dateOnly: boolean } | null {
  const m = (s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return null
  const dateOnly = !m[4] || (m[4] === '00' && m[5] === '00')
  return { y: +m[1], mo: +m[2], d: +m[3], h: dateOnly ? 10 : +m[4], mi: dateOnly ? 0 : +m[5], dateOnly }
}

function addrText(a: LdEvent['location']): string {
  const ad = a?.address
  if (!ad) return ''
  if (typeof ad === 'string') return stripHtml(ad)
  return [ad.streetAddress, ad.addressLocality, ad.addressCountry].filter(Boolean).join(', ')
}

export const ecovillage: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(PAGE)
    if (!html) return []
    const all: LdEvent[] = extractLd(html)

    // MEC "load more" pagination
    const atts = html.match(/atts:\s*"([^"]+)"/)?.[1]
    let endDate = html.match(/end_date:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1]
    let offset = html.match(/offset:\s*"(\d+)"/)?.[1] ?? '0'
    let divider = html.match(/current_month_divider:\s*"(\d+)"/)?.[1] ?? ''
    const limit = html.match(/limit:\s*"(\d+)"/)?.[1] ?? '12'
    for (let i = 0; atts && endDate && i < MAX_LOADS; i++) {
      await sleep(1000)
      const body = `action=mec_list_load_more&mec_start_date=${endDate}&mec_offset=${offset}&mec_limit=${limit}`
        + `&${atts}&current_month_divider=${divider}&apply_sf_date=0`
      const txt = await getText(AJAX, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
      })
      if (!txt) break
      let d: any
      try { d = JSON.parse(txt) } catch { break }
      if (typeof d?.html === 'string') all.push(...extractLd(d.html))
      if (!d?.has_more_event || !d.end_date || d.end_date === endDate) break
      endDate = String(d.end_date)
      offset = String(d.offset ?? 0)
      divider = String(d.current_month_divider ?? '')
    }

    const now = Date.now()
    const seen = new Set<string>()
    const events: RawEvent[] = []
    for (const e of all) {
      const title = stripHtml(e.name ?? '')
      if (!title) continue
      const locName = stripHtml(e.location?.name ?? '')
      const addr = addrText(e.location)
      if (/online/i.test(e.eventAttendanceMode ?? '') && !/mixed/i.test(e.eventAttendanceMode ?? '')) continue
      if (/cancel|postpon/i.test(e.eventStatus ?? '')) continue
      if (!locName && !addr) continue
      if (/^online$/i.test(locName) || ONLINE_RE.test(title) || ONLINE_RE.test(locName)) continue

      const st = parseLocal(e.startDate)
      if (!st) continue
      const key = `${title}|${e.startDate}`
      if (seen.has(key)) continue
      seen.add(key)

      // rough pre-check (±14h covers every zone) before spending a geocode call
      if (Date.UTC(st.y, st.mo - 1, st.d, st.h, st.mi) < now - 14 * 3600_000) continue

      const bare = locName.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
      const paren = locName.match(/\(([^)]+)\)/)?.[1] ?? ''
      const geo = await geocodeWorldFirst([
        [locName, addr].filter(Boolean).join(', '),
        [bare, addr].filter(Boolean).join(', '),
        [paren, addr].filter(Boolean).join(', '),
        addr,
        locName,
      ])
      if (!geo) continue
      const tz = tzFor(geo.cc, geo.lat, geo.lng, geo.state)
      if (!tz) continue

      const startsAt = zonedIso(tz, st.y, st.mo, st.d, st.h, st.mi)
      if (!startsAt || Date.parse(startsAt) < now + 3600_000) continue
      const en = parseLocal(e.endDate)
      let endsAt = en ? zonedIso(tz, en.y, en.mo, en.d, en.dateOnly ? 18 : en.h, en.dateOnly ? 0 : en.mi) : null
      if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = null

      const price = parseFloat(e.offers?.price ?? '')
      const url = e.url || e.offers?.url || PAGE
      events.push({
        source: SRC,
        source_id: `gen-${hashStr(`${title}|${e.startDate}`)}`,
        source_url: url,
        title,
        description: stripHtml(e.description ?? '').slice(0, 800),
        organizer: 'Global Ecovillage Network Europe',
        location_name: [locName, addr].filter(Boolean).join(', '),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startsAt,
        ends_at: endsAt,
        cost: price > 0 ? `${e.offers?.priceCurrency === 'EUR' ? '€' : `${e.offers?.priceCurrency ?? ''} `}${price}` : 'See event page',
        image_url: e.image || null,
      })
    }

    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return events.slice(0, MAX_EVENTS)
  },
}
