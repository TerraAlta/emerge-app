/**
 * Regenerativ Schweiz — regenerativ.ch
 * Swiss regenerative-agriculture association: field days, practice days,
 * base courses (grassland, orchards, vineyards), slurry analysis workshops
 * and online talks.
 *
 * The site is Wix with the Wix Events app; https://www.regenerativ.ch/events
 * embeds every listed event as JSON (UTC start/end, location type
 * 0 = venue / 1 = online, address + coordinates, "scheduleTbd" for
 * pre-registrations without a date). Read with extractWixEvents.
 * Online events and undated pre-registrations ("Voranmeldung …", TBD date or
 * TBD place) are skipped — at the time of writing (Oct 2026) every listed
 * event was one of those, so this source may legitimately return 0 until
 * dated in-person courses/field days are published.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, geocodeChFirst, extractWixEvents, ONLINE_RE } from './ch-common'

const SRC = 'regenerativ-ch'
const BASE = 'https://www.regenerativ.ch'

export const regenerativCh: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(`${BASE}/events`, 25000)
    if (!html) return []
    const now = Date.now()
    const out: RawEvent[] = []
    for (const e of extractWixEvents(html)) {
      const c = e.scheduling?.config ?? {}
      const loc = e.location ?? {}
      const title = String(e.title ?? '').trim()
      if (!title || c.scheduleTbd || !c.startDate || loc.tbd) continue
      if (loc.type === 1 || ONLINE_RE.test(title) || ONLINE_RE.test(loc.name ?? '')) continue
      const start = new Date(c.startDate)
      if (isNaN(start.getTime()) || start.getTime() < now) continue
      let lat = loc.coordinates?.lat ?? loc.fullAddress?.geocode?.latitude
      let lng = loc.coordinates?.lng ?? loc.fullAddress?.geocode?.longitude
      if (!(typeof lat === 'number' && typeof lng === 'number') || (!lat && !lng)) {
        const g = await geocodeChFirst([loc.address ?? '', loc.name ?? ''].filter(Boolean))
        if (!g) continue
        lat = g.lat; lng = g.lng
      }
      const end = c.endDate && !c.endDateHidden ? new Date(c.endDate).toISOString() : null
      const t = e.registration?.ticketing
      const price = t?.lowestTicketPriceFormatted || t?.lowestPrice?.formatted
      out.push({
        source: SRC,
        source_id: `regen-ch-${e.id}`,
        source_url: `${BASE}/events-1/${e.slug}`,
        title,
        description: stripHtml(String(e.description || e.about || '')).slice(0, 600) || `${title} — Regenerativ Schweiz`,
        organizer: 'Regenerativ Schweiz',
        location_name: [loc.name, loc.address].filter((s: string) => s && s.trim()).join(', ') || 'Schweiz',
        lat, lng,
        starts_at: start.toISOString(),
        ends_at: end && end > start.toISOString() ? end : null,
        cost: price ? String(price) : 'Siehe Veranstaltung',
        image_url: e.mainImage?.url ?? null,
      })
    }
    return out
  },
}
