/**
 * Natagora — natagora.be
 * Walloon/Brussels nature conservation NGO: guided walks, reserve
 * management days (chantiers de gestion), workshops, talks — hundreds of
 * local activities a month run by its regional groups.
 *
 * The agenda (/agenda) is a Drupal Search API view filtered by start date
 * (field_start[min]/[max]) and paged 15 at a time (?page=N). Each page
 * carries:
 *   - the teasers: link, title, category tag, start day + month (no year /
 *     time), and a second day/month for multi-day ranges;
 *   - drupalSettings.agenda_map.node: {id, title, lat, lng} for every teaser
 *     that has a venue — real coordinates, matched to teasers by title.
 * Detail pages add the exact times ("Samedi 10 octobre 2026 de 08:00 à
 * 11:00" / "Du … à 19:00 au … à 17:30"), address, price and description.
 *
 * Budget (≤ 40 requests): up to MAX_PAGES listing pages (next WINDOW_DAYS
 * days), then detail pages for the earliest events with what is left. Events beyond
 * the detail budget keep the listing date at 10:00 local (time unknown) and
 * the map coordinates; listing-only events without map coordinates are
 * skipped. Long-running series that started in the past ("8 juil → 31 oct")
 * are skipped. Online events are skipped.
 */
import * as cheerio from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { decodeEntities } from './utils'
import { getText, parisIso, frMonth, geocodeFrFirst, ONLINE_RE } from './fr-common'

const SRC = 'natagora-be'
const BASE = 'https://www.natagora.be'
const WINDOW_DAYS = 31
const MAX_PAGES = 10
const MAX_REQUESTS = 40 // listing pages + detail pages
const MAX_EVENTS = 200

interface Teaser {
  path: string
  title: string
  tag: string
  image: string | null
  sd: number; sm: number            // start day / month
  ed?: number; em?: number          // end day / month (ranges)
  lat?: number; lng?: number
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Year for a day/month seen on a listing that starts today (±). */
function inferYear(m: number, d: number, now: Date): number {
  const y = now.getUTCFullYear()
  const cand = Date.UTC(y, m - 1, d)
  // A date more than ~6 months in the past belongs to next year
  return cand < now.getTime() - 183 * 86400000 ? y + 1 : y
}

function parseListing(html: string): Teaser[] {
  const out: Teaser[] = []
  // Map pins (only teasers with a venue have one)
  const pins = new Map<string, { lat: number; lng: number }>()
  const sm = html.match(/data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/)
  if (sm) {
    try {
      const nodes = JSON.parse(sm[1])?.agenda_map?.node ?? {}
      for (const n of Object.values<any>(nodes)) {
        const lat = parseFloat(n.lat)
        const lng = parseFloat(n.lng)
        if (lat > 49.3 && lat < 51.6 && lng > 2.4 && lng < 6.5) pins.set(norm(decodeEntities(String(n.title ?? ''))), { lat, lng })
      }
    } catch { /* no pins */ }
  }

  const $ = cheerio.load(html.replace(/<!--[\s\S]*?-->/g, ''))
  $('article.agenda-teaser-v2').each((_, el) => {
    const a = $(el)
    const path = a.find('a[href^="/agenda/"]').first().attr('href')
    const title = a.find('.agenda-teaser-v2__content-title').text().replace(/\s+/g, ' ').trim()
    if (!path || !title) return
    const days = a.find('[class*="agenda-date__day"]').map((_, x) => parseInt($(x).text().trim(), 10)).get()
    const months = a.find('[class*="agenda-date__month"]').map((_, x) => frMonth($(x).text().trim()) ?? 0).get()
    if (!days[0] || !months[0]) return
    const pin = pins.get(norm(title))
    const img = a.find('img').first().attr('src')
    out.push({
      path, title,
      tag: a.find('[class*="content-tags-item"]').first().text().replace(/\s+/g, ' ').trim(),
      image: img ? new URL(img, BASE).toString() : null,
      sd: days[0], sm: months[0],
      ed: days[1] || undefined, em: months[1] || undefined,
      lat: pin?.lat, lng: pin?.lng,
    })
  })
  return out
}

const FR_DT = /(\d{1,2})\s+([a-zéû]+\.?)\s+(\d{4})(?:\s+(?:à|de)\s+(\d{1,2})[:h](\d{2}))?/gi

interface Detail {
  start: string | null
  end: string | null
  address: string
  organizer: string
  price: string
  description: string
}

/** Text lines of a sidebar block ("Adresse", "Organisateur", "Prix"). */
function infoLines($: cheerio.CheerioAPI, label: string): string[] {
  let html = ''
  $('.agenda-v2__info-label').each((_, el) => {
    if (html || $(el).text().trim() !== label) return
    html = $(el).parent().find('.agenda-v2__info-description').first().html() ?? ''
  })
  const lines = decodeEntities(html.replace(/<[^>]+>/g, '\n')).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  return lines.filter((l, i) => lines.indexOf(l) === i) // de-duplicate repeated lines
}

function parseDetail(html: string): Detail {
  const $ = cheerio.load(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, ''))
  const dateTxt = $('.agenda-v2__info-date-content').first().text().replace(/\s+/g, ' ').trim()
  const hits = [...dateTxt.matchAll(FR_DT)]
  let start: string | null = null
  let end: string | null = null
  if (hits[0]) {
    const [, d, mo, y, h, mi] = hits[0]
    const m = frMonth(mo)
    if (m) start = parisIso(+y, m, +d, h ? +h : 10, h ? +mi : 0)
    if (start && hits[1]) {
      const [, d2, mo2, y2, h2, mi2] = hits[1]
      const m2 = frMonth(mo2)
      if (m2 && h2) end = parisIso(+y2, m2, +d2, +h2, +mi2)
    } else if (start && m) {
      // "de 08:00 à 11:00" → same-day end
      const t = dateTxt.match(/de\s+\d{1,2}[:h]\d{2}\s+à\s+(\d{1,2})[:h](\d{2})/i)
      if (t) end = parisIso(+hits[0][3], m, +hits[0][1], +t[1], +t[2])
    }
  }
  const body = $('.agenda-v2__content-text-body').first().text().replace(/\s+/g, ' ').trim()
  return {
    start,
    end: end && start && end > start ? end : null,
    address: (() => {
      // ["Cinéma Vendome", "Chau. de Wavre 18, 1050 Ixelles", "1050", "Ixelles"]
      const parts: string[] = []
      for (const l of infoLines($, 'Adresse')) {
        const prev = parts[parts.length - 1]
        if (prev && /^\d{4}$/.test(prev)) parts[parts.length - 1] = `${prev} ${l}`
        else parts.push(l)
      }
      const last = parts[parts.length - 1]
      if (parts.length > 1 && last && parts.slice(0, -1).join(' ').includes(last)) parts.pop()
      return parts.join(', ')
    })(),
    organizer: (() => {
      const l = infoLines($, 'Organisateur')
      return l.find((x) => /natagora/i.test(x)) ?? l[0] ?? ''
    })(),
    price: infoLines($, 'Prix').join(' '),
    description: body.slice(0, 600),
  }
}

export const natagoraBe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = new Date()
    const min = ymd(now)
    const max = ymd(new Date(now.getTime() + WINDOW_DAYS * 86400000))

    // 1. Listing pages
    const teasers: Teaser[] = []
    const seen = new Set<string>()
    let pages = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      pages++
      const html = await getText(`${BASE}/agenda?field_start%5Bmin%5D=${min}&field_start%5Bmax%5D=${max}&page=${page}`)
      if (!html) break
      const items = parseListing(html)
      let added = 0
      for (const t of items) {
        if (seen.has(t.path)) continue
        seen.add(t.path)
        teasers.push(t)
        added++
      }
      if (!added || !html.includes(`page=${page + 1}"`)) break
    }

    // Drop long-running series that already started; keep the rest in date order
    const nowMs = now.getTime()
    const candidates = teasers
      .map((t) => ({ t, y: inferYear(t.sm, t.sd, now) }))
      .filter(({ t, y }) => {
        if (ONLINE_RE.test(t.title)) return false
        const startDay = Date.UTC(y, t.sm - 1, t.sd)
        return startDay >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      })
      .sort((a, b) => Date.UTC(a.y, a.t.sm - 1, a.t.sd) - Date.UTC(b.y, b.t.sm - 1, b.t.sd))

    // 2. Events
    const events: RawEvent[] = []
    let details = 0
    const MAX_DETAILS = MAX_REQUESTS - pages
    for (const { t, y } of candidates) {
      if (events.length >= MAX_EVENTS) break
      const url = `${BASE}${t.path}`
      let start: string | null = null
      let end: string | null = null
      let lat = t.lat
      let lng = t.lng
      let place = ''
      let organizer = 'Natagora'
      let cost = 'Voir site'
      let description = ''

      if (details < MAX_DETAILS) {
        details++
        const html = await getText(url)
        if (html) {
          const d = parseDetail(html)
          start = d.start
          end = d.end
          place = d.address
          description = d.description
          if (d.organizer) organizer = d.organizer.includes('Natagora') ? d.organizer : `Natagora — ${d.organizer}`
          if (d.price) cost = /gratuit/i.test(d.price) ? 'Gratuit' : d.price.slice(0, 80)
          if (ONLINE_RE.test(place) && !/\d{4}\s+\p{L}/u.test(place)) continue
          if (lat == null && place && /\b\d{4}\b/.test(place)) {
            const pc = place.match(/\b(\d{4})\s+([\p{L}' -]+)/u)
            const geo = await geocodeFrFirst([`${place}, Belgique`, pc ? `${pc[1]} ${pc[2].trim()}, Belgique` : ''])
            if (geo) { lat = geo.lat; lng = geo.lng }
          }
        }
      }
      if (!start) start = parisIso(y, t.sm, t.sd, 10, 0) // date known, time not
      if (!start || lat == null || lng == null) continue
      if (Date.parse(start) < nowMs) continue
      if (!end && t.ed && t.em && (t.ed !== t.sd || t.em !== t.sm)) {
        const ey = t.em < t.sm ? y + 1 : y
        end = parisIso(ey, t.em, t.ed, 17, 0)
      }

      events.push({
        source: SRC,
        source_id: `nat-be-${t.path.replace('/agenda/', '')}`,
        source_url: url,
        title: t.title,
        description: description || `${t.tag ? `${t.tag} — ` : ''}activité Natagora.`,
        organizer,
        location_name: place || 'Wallonie / Bruxelles',
        lat, lng,
        starts_at: start,
        ends_at: end,
        cost,
        image_url: t.image,
      })
    }
    console.log(`[${SRC}] ${pages} listing pages, ${details} detail pages, ${events.length} events`)
    return events
  },
}
