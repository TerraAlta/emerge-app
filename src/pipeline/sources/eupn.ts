/**
 * European Permaculture Network — permaculture-network.eu
 * Community-submitted permaculture courses (PIC, PDC, teacher trainings),
 * workshops, festivals and convergences across Europe.
 *
 * Drupal site. The listing /permaculture-courses-events links each current
 * event as /events/<yyyy-mm>-<slug>. Each detail page has
 *   - JSON-LD Event with eventAttendanceMode (Online events are skipped) and
 *     a PostalAddress (street, postcode, locality, country);
 *   - the date field: <div class="f--name-field-datum"><time datetime="…Z">
 *     08.10.2026 - 16:30</time> - <time …>08.11.2026 - 18:00</time>.
 * Timed dates use the stored UTC instant from the datetime="…Z" attribute
 * (the JSON-LD offsets are mislabelled); date-only ones become 10:00 local
 * in the venue country's zone. Venues are geocoded (Nominatim).
 */
import * as cheerio from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, geocodeEuFirst, tzForCountry, zonedIso, COUNTRY_CC } from './eu-common'

const SRC = 'eupn'
const BASE = 'https://permaculture-network.eu'
const LISTINGS = [`${BASE}/permaculture-courses-events`, `${BASE}/courses-events`]
const MAX_DETAILS = 30

function parseShown(s: string): { y: number; mo: number; d: number; h?: number; mi?: number } | null {
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s*-\s*(\d{1,2}):(\d{2}))?/)
  if (!m) return null
  return { y: +m[3], mo: +m[2], d: +m[1], h: m[4] ? +m[4] : undefined, mi: m[5] ? +m[5] : undefined }
}

export const eupn: SourceFetcher = {
  name: SRC,
  async fetch() {
    const links: string[] = []
    for (const url of LISTINGS) {
      const html = await getText(url)
      if (!html) continue
      for (const m of html.matchAll(/href="(\/events\/(\d{4})-(\d{2})-[^"?#]+)"/g)) {
        const path = m[1]
        // Slug carries the start month: skip ones that clearly ended long ago
        const ym = +m[2] * 12 + +m[3]
        const now = new Date()
        if (ym < now.getUTCFullYear() * 12 + now.getUTCMonth() + 1 - 6) continue
        if (!links.includes(path)) links.push(path)
      }
    }

    const events: RawEvent[] = []
    for (const path of links.slice(0, MAX_DETAILS)) {
      const url = BASE + path
      const html = await getText(url)
      if (!html) continue
      const $ = cheerio.load(html)

      let ld: any = null
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const d = JSON.parse($(el).text())
          if (d?.['@type'] === 'Event') ld = d
        } catch { /* ignore */ }
      })
      if (!ld || /Online/i.test(ld.eventAttendanceMode ?? '') || ld.location?.['@type'] === 'VirtualLocation') continue
      const addr = ld.location?.address ?? {}
      const country = String(addr.addressCountry ?? $('.address .country').first().text()).trim()
      const locality = String(addr.addressLocality ?? '').trim()
      if (!country && !locality) continue
      const tz = tzForCountry(country) ?? 'Europe/Berlin'

      // Timed: trust the stored UTC instant (datetime="…Z"). Date-only: 10:00 / 18:00 local.
      const times = $('.f--name-field-datum time')
      const at = (i: number, defH: number): string | null => {
        const shown = parseShown(times.eq(i).text())
        if (!shown) return null
        const utc = times.eq(i).attr('datetime') ?? ''
        if (shown.h !== undefined && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(utc)) return new Date(utc).toISOString()
        return zonedIso(tz, shown.y, shown.mo, shown.d, shown.h ?? defH, shown.mi ?? 0)
      }
      const starts = at(0, 10)
      if (!starts) continue
      let ends = at(1, 18)
      if (ends && ends <= starts) ends = null
      if (new Date(ends ?? starts).getTime() < Date.now()) continue

      const org = stripHtml($('.address .organization').first().text())
      const street = String(addr.streetAddress ?? '').trim()
      const postal = String(addr.postalCode ?? '').trim()
      const cc = COUNTRY_CC[country.toLowerCase()]
      const geo = await geocodeEuFirst([
        [street, `${postal} ${locality}`.trim(), country].filter(Boolean).join(', '),
        [org, locality, country].filter(Boolean).join(', '),
        [locality, country].filter(Boolean).join(', '),
      ], cc)
      if (!geo) continue

      const title = stripHtml($('h1').first().text()) || stripHtml(ld.name ?? '')
      const body = $('.f--name-body, .field--name-body').first().text()
      const description = stripHtml(body || ld.description || '').slice(0, 500)
      const teachers = (ld.performer ?? []).map((p: any) => p?.name).filter(Boolean)

      events.push({
        source: SRC,
        source_id: `eupn-${hashStr(path)}`,
        source_url: url,
        title,
        description: description || stripHtml(ld.description ?? '').slice(0, 500),
        organizer: stripHtml(ld.organizer?.name ?? '') || teachers[0] || 'European Permaculture Network',
        location_name: [org, locality, country].filter(Boolean).join(', '),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: starts,
        ends_at: ends,
        cost: 'See event page',
        image_url: typeof ld.image === 'string' ? ld.image : null,
      })
    }
    return events
  },
}
