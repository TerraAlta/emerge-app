/**
 * European Permaculture Network — permaculture-network.eu (Drupal)
 * Permaculture courses (PDCs), workshops, festivals and convergences posted
 * by teachers and groups — mostly Europe, some worldwide (e.g. IPC16 Thailand).
 *
 * Discovery: sitemap.xml lists every event as /events/YYYY-MM-<slug> (YYYY-MM =
 * start month), so we only open the ones starting this month or later.
 * Detail page fields:
 *   field-datum   <time datetime="…Z">05.10.2026 - 08:00</time> - <time …>
 *   The datetime attributes are NOT reliable UTC: the site renders the
 *   poster's wall-clock time in Europe/Berlin (a Devon course "16:00" shows as
 *   15:00Z, the map view even stamps the wall-clock with a bare Z). So we take
 *   the displayed wall-clock "dd.mm.yyyy - HH:MM" and convert it with the
 *   venue country's time zone (date-only → 10:00 local).
 *   field-address organization / address-line1 / postal-code / locality / country
 *   "Online: ✔"   online-only course → skipped
 *   "Price from: 600 €", "Type: Workshop", og:description
 * Coordinates: the /courses-events map view carries data-lat/lng per event
 * link; otherwise the address is geocoded with Nominatim.
 *
 * NOTE: eupn.ts scrapes the same site under source 'eupn'.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities } from './utils'
import { getText, geocodeWorldFirst, ONLINE_RE, countryCodeFromName, tzFor, zonedIso } from './global-common'

const SRC = 'eupn-global'
const BASE = 'https://permaculture-network.eu'
const MAX_DETAILS = 30
const MAX_EVENTS = 200

function field(html: string, name: string): string {
  const i = html.indexOf(`f--name-${name} `)
  if (i < 0) return ''
  const rest = html.slice(i, i + 3000)
  return rest.split(/<div class="f f--name-/)[0]
}

export const eupnGlobal: SourceFetcher = {
  name: SRC,
  async fetch() {
    const sitemap = await getText(`${BASE}/sitemap.xml`)
    if (!sitemap) return []
    const d = new Date()
    const curKey = d.getUTCFullYear() * 100 + d.getUTCMonth() + 1
    const urls = [...new Set(
      [...sitemap.matchAll(/<loc>(https:\/\/permaculture-network\.eu\/events\/(\d{4})-(\d{2})-[^<]+)<\/loc>/g)]
        .filter((m) => +m[2] * 100 + +m[3] >= curKey)
        .map((m) => m[1]),
    )].sort().slice(0, MAX_DETAILS)
    if (!urls.length) return []

    // Coordinates from the map view, keyed by event path
    const coords = new Map<string, { lat: number; lng: number }>()
    const listing = await getText(`${BASE}/courses-events`)
    if (listing) {
      for (const block of listing.split(/class="geolocation-location/).slice(1)) {
        const lat = parseFloat(block.match(/data-lat="([^"]+)"/)?.[1] ?? '')
        const lng = parseFloat(block.match(/data-lng="([^"]+)"/)?.[1] ?? '')
        const href = block.match(/href="(\/events\/[^"]+)"/)?.[1]
        if (href && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) coords.set(href, { lat, lng })
      }
    }

    const now = Date.now()
    const events: RawEvent[] = []
    for (const url of urls) {
      if (events.length >= MAX_EVENTS) break
      const html = await getText(url)
      if (!html) continue
      const main = html.slice(Math.max(0, html.indexOf('<main')))
      const text = stripHtml(main.replace(/<script[\s\S]*?<\/script>/g, ''))
      if (/Online:\s*✔/.test(text)) continue

      const datum = field(html, 'field-datum')
      const shown = [...datum.matchAll(/<time datetime="[^"]+"[^>]*>\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*-\s*(\d{1,2}):(\d{2}))?/g)]
      if (!shown.length) continue
      const s0 = shown[0]
      if (Date.UTC(+s0[3], +s0[2] - 1, +s0[1]) < now - 86400_000) continue // already started

      const title = decodeEntities(html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? '').trim()
      if (!title || ONLINE_RE.test(title)) continue

      const addrHtml = field(html, 'field-address')
      const part = (cls: string) => stripHtml(addrHtml.match(new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)</span>`))?.[1] ?? '')
      const org = part('organization'), line1 = part('address-line1'), postal = part('postal-code')
      const locality = part('locality'), country = part('country')
      if (!locality && !country && !line1) continue // no physical venue
      const locName = [...new Set([org, line1, [postal, locality].filter(Boolean).join(' '), country].filter(Boolean))].join(', ')

      const path = new URL(url).pathname
      let geo: { lat: number; lng: number } | null = coords.get(path) ?? null
      if (!geo) {
        geo = await geocodeWorldFirst([
          [line1, postal, locality, country].filter(Boolean).join(', '),
          [postal, locality, country].filter(Boolean).join(', '),
          [locality, country].filter(Boolean).join(', '),
        ])
      }
      if (!geo) continue

      const tz = tzFor(countryCodeFromName(country), geo.lat, geo.lng)
      const toIso = (m: RegExpMatchArray, defH: number) =>
        zonedIso(+m[3], +m[2], +m[1], m[4] ? +m[4] : defH, m[5] ? +m[5] : 0, tz)
      const startIso = toIso(shown[0], 10)
      if (!startIso) continue
      const startMs = Date.parse(startIso)
      if (startMs < now + 3600_000) continue
      const endIso = shown[1] ? toIso(shown[1], 17) : null
      const endMs = endIso ? Date.parse(endIso) : NaN

      const desc = decodeEntities(html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ?? '').trim()
      const type = text.match(/Type:\s*([^|]+?)\s+(?:Course type|Date|Main language):/)?.[1]?.trim()
      const courseType = text.match(/Course type:\s*(.+?)\s+Date:/)?.[1]?.trim()
      const lang = text.match(/Main language:\s*(\S+)/)?.[1]
      const price = text.match(/Price from:\s*([^\s].{0,20}?(?:€|£|EUR|GBP|USD|\$|CHF|zł|kn|Kč|lei|TL))/)?.[1]

      events.push({
        source: SRC,
        source_id: `eupn-g-${path.replace('/events/', '').slice(0, 90)}`,
        source_url: url,
        title,
        description: [
          desc,
          [type, courseType].filter(Boolean).join(' — '),
          lang ? `Language: ${lang}.` : '',
        ].filter(Boolean).join(' ').slice(0, 1000),
        organizer: org || 'European Permaculture Network listing',
        location_name: locName,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startIso,
        ends_at: Number.isFinite(endMs) && endMs > startMs ? new Date(endMs).toISOString() : null,
        cost: price ? `From ${price}` : 'See event page',
      })
    }
    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return events
  },
}
