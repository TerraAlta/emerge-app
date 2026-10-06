/**
 * Berlin community art, garden & music spaces —
 * Prinzessinnengarten Kollektiv, Holzmarkt, Urban Spree, Klunkerkranich.
 *
 * - Prinzessinnengarten Kollektiv (Neukölln; prinzessinnengarten.net now has a
 *   broken certificate, the collective lives at prinzessinnengarten-kollektiv.net):
 *   The Events Calendar REST API with UTC start/end and venues (studio
 *   nagelneu, Kiezkapelle, GutsGarten Hellersdorf). Venue-less "Park" events
 *   name their park in the title ("… in der Hasenheide") and are geocoded;
 *   otherwise they are placed at the garden (Hermannstraße 99–105).
 * - Holzmarkt 25 (Drupal): /kalender lists the next three months; each teaser
 *   carries an add-to-calendar block with UTC start/end, a category
 *   (Konzert, Festival, Wintermarkt, Party…) and the stage on site.
 * - Urban Spree (Revaler Str. 99): /program/<category>/ cards with
 *   data-dateStart (Berlin local) — events, workshops, festivals, concerts
 *   (newest first; we page back until we reach the past, ≤ 3 pages each).
 * - Klunkerkranich (rooftop garden, Neukölln Arcaden): /events/ cards with
 *   the date in the slug and "16:00 — 02:00"; in the off-season it only lists
 *   club nights, which we drop.
 *
 * Club nights, parties and DJ sets are dropped everywhere; times are
 * Europe/Berlin.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, getJson, zonedIso, geocodeFirst, ONLINE_RE, type LatLng } from './misc-common'

const TZ = 'Europe/Berlin'
const MAX_PER_SPACE = 100
const EXCLUDE_RX = /club night|clubnacht|dj set|\bdjs?\b|techno|house music|\brave\b|\bparty\b|clubkultur|corporate|sponsor|\bVIP\b/i

const PRINZ = { name: 'prinzessinnengarten', org: 'Prinzessinnengarten Kollektiv', address: 'Hermannstraße 99–105, 12051 Berlin', lat: 52.4705, lng: 13.4292 }
const HOLZMARKT = { name: 'holzmarkt', org: 'Holzmarkt 25', address: 'Holzmarktstraße 25, 10243 Berlin', lat: 52.51190, lng: 13.42536 }
const SPREE = { name: 'urbanspree', org: 'Urban Spree', address: 'Revaler Straße 99, 10245 Berlin', lat: 52.50761, lng: 13.45165 }
const KLUNKER = { name: 'klunkerkranich', org: 'Klunkerkranich', address: 'Karl-Marx-Straße 66, 12043 Berlin', lat: 52.4818, lng: 13.4331 }

const future = (iso: string | null | undefined): iso is string => !!iso && Date.parse(iso) > Date.now() + 3600_000

function berlinLocal(s: string | undefined): string | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  return m ? zonedIso(TZ, +m[1], +m[2], +m[3], +m[4], +m[5]) : null
}

function utcStamp(s: string | undefined): string | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString() : null
}

// ── Prinzessinnengarten Kollektiv (Tribe Events API) ──────────────────────

async function fetchPrinz(): Promise<RawEvent[]> {
  const out: RawEvent[] = []
  const today = new Date().toISOString().slice(0, 10)
  for (let page = 1; page <= 3 && out.length < MAX_PER_SPACE; page++) {
    const d = await getJson<any>(`https://prinzessinnengarten-kollektiv.net/wp-json/tribe/events/v1/events?per_page=50&page=${page}&start_date=${today}`)
    const events: any[] = d?.events ?? []
    for (const e of events) {
      const title = stripHtml(e.title ?? '')
      const start = utcStamp(e.utc_start_date)
      if (!title || !future(start) || EXCLUDE_RX.test(title) || ONLINE_RE.test(title)) continue
      if (e.all_day) continue // multi-week exhibitions/series without a time
      const end = utcStamp(e.utc_end_date)
      const v = e.venue && !Array.isArray(e.venue) ? e.venue : null
      let geo: LatLng | null = null
      let locName = ''
      if (v) {
        const lat = parseFloat(v.geo_lat)
        const lng = parseFloat(v.geo_lng)
        const addr = [v.address, v.zip, (v.city ?? '').replace(/^Berliin$/i, 'Berlin')].filter(Boolean).join(' ')
        geo = Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : await geocodeFirst([addr, `${v.venue}, Berlin`], 'de')
        locName = [v.venue, addr].filter(Boolean).join(', ')
      } else {
        // "Workshop … in der Hasenheide", "Vogelbeobachtung … in der Gropiusstadt"
        const place = title.match(/\b(?:in der|im|in|am)\s+((?:Park am |Volkspark )?[A-ZÄÖÜ][\wäöüß-]+(?:\s+[A-ZÄÖÜ][\wäöüß-]+)?)\s*$/)?.[1]
        if (place) {
          geo = await geocodeFirst([`${place}, Berlin`], 'de')
          if (geo) locName = `${place}, Berlin`
        }
      }
      if (!geo) { geo = { lat: PRINZ.lat, lng: PRINZ.lng }; locName = `${PRINZ.org}, ${PRINZ.address}` }
      out.push({
        source: PRINZ.name,
        source_id: `prinz-${e.id}`,
        source_url: e.url ?? 'https://prinzessinnengarten-kollektiv.net/events/',
        title,
        description: stripHtml(e.description ?? e.excerpt ?? '').slice(0, 500) || `${title} — ${PRINZ.org}, Berlin.`,
        organizer: PRINZ.org,
        location_name: locName,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: start,
        ends_at: end && end > start ? end : null,
        cost: stripHtml(e.cost ?? '') || 'See event page',
        image_url: e.image?.url ?? null,
      })
    }
    if (!d?.next_rest_url || events.length < 50) break
  }
  return out
}

// ── Holzmarkt (calendar teasers with add-to-calendar UTC times) ───────────

async function fetchHolzmarkt(): Promise<RawEvent[]> {
  const html = await getText('https://www.holzmarkt.com/kalender')
  if (!html) return []
  const out: RawEvent[] = []
  const seenSlug = new Map<string, number>()
  for (const m of html.matchAll(/<article class="node node-event view-mode-teaser">([\s\S]*?)<\/article>/g)) {
    const b = m[1]
    const href = b.match(/href="(\/veranstaltung\/[^"]+)"/)?.[1]
    const title = stripHtml(b.match(/<var class="atc_title">([\s\S]*?)<\/var>/)?.[1] ?? b.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] ?? '')
    const cat = stripHtml(b.match(/<div class="event-category">([\s\S]*?)<\/div>/)?.[1] ?? '')
    const tz = stripHtml(b.match(/<var class="atc_timezone">([\s\S]*?)<\/var>/)?.[1] ?? '')
    if (!href || !title || tz !== 'UTC') continue
    if (/party|club/i.test(cat) || EXCLUDE_RX.test(title)) continue
    const start = utcStamp(stripHtml(b.match(/<var class="atc_date_start">([\s\S]*?)<\/var>/)?.[1] ?? ''))
    if (!future(start)) continue
    // Recurring markets repeat one page (Drupal suffix -0, -1 …) for every
    // opening day: keep the next 4 dates per page.
    const slug = href.replace(/-\d$/, '')
    const n = seenSlug.get(slug) ?? 0
    if (n >= 4) continue
    seenSlug.set(slug, n + 1)
    const endRaw = utcStamp(stripHtml(b.match(/<var class="atc_date_end">([\s\S]*?)<\/var>/)?.[1] ?? ''))
    const end = endRaw && endRaw > start && Date.parse(endRaw) - Date.parse(start) <= 24 * 3600_000 ? endRaw : null
    const stage = stripHtml(b.match(/<span class="location">([\s\S]*?)<\/span>/)?.[1] ?? '')
    const desc = stripHtml(stripHtml(b.match(/<var class="atc_description">([\s\S]*?)<\/var>/)?.[1] ?? '')) // entity-encoded HTML
    const price = desc.match(/Eintritt:\s*(frei|free|\d+(?:[.,]\d{1,2})?)/i)?.[1]
    out.push({
      source: HOLZMARKT.name,
      source_id: `holzmarkt-${href.split('/').pop()}-${start.slice(0, 10)}`,
      source_url: `https://www.holzmarkt.com${href}`,
      title,
      description: [cat && `${cat} at Holzmarkt 25${stage ? ` (${stage})` : ''}.`, desc].filter(Boolean).join(' ').slice(0, 500),
      organizer: HOLZMARKT.org,
      location_name: `${HOLZMARKT.org}${stage && !/holzmarkt/i.test(stage) ? ` – ${stage}` : ''}, ${HOLZMARKT.address}`,
      lat: HOLZMARKT.lat,
      lng: HOLZMARKT.lng,
      starts_at: start,
      ends_at: end,
      cost: !price ? 'See event page' : /fre/i.test(price) ? 'Free' : parseFloat(price.replace(',', '.')) > 0 ? `€${price}` : 'See event page',
    })
    if (out.length >= MAX_PER_SPACE) break
  }
  return out
}

// ── Urban Spree (program cards, Berlin local time) ─────────────────────────

async function fetchUrbanSpree(): Promise<RawEvent[]> {
  const out: RawEvent[] = []
  const seen = new Set<string>()
  for (const cat of ['events', 'workshops', 'festivals', 'concerts']) {
    for (let page = 1; page <= 3; page++) {
      const html = await getText(`https://www.urbanspree.com/program/${cat}/${page > 1 ? `?page=${page}` : ''}`)
      if (!html) break
      let anyFuture = false
      for (const m of html.matchAll(/<a (data-slidertype="[^"]*"[^>]*)>([\s\S]*?)<\/a>/g)) {
        const href0 = m[1].match(/\bhref="([^"]+)"/)?.[1]
        const start = berlinLocal(m[1].match(/\bdata-dateStart="([^"]+)"/)?.[1])
        if (!href0) continue
        if (!future(start)) continue
        anyFuture = true
        const href = href0.startsWith('http') ? href0 : `https://www.urbanspree.com/${href0.replace(/^\//, '')}`
        if (seen.has(href)) continue
        seen.add(href)
        const b = m[2]
        const label = stripHtml(b.match(/class="card-text mb-0 cat">([\s\S]*?)<\/p>/)?.[1] ?? cat)
        const title = stripHtml(b.match(/class="card-text mb-0 title">([\s\S]*?)<\/p>/)?.[1] ?? '')
        if (!title || EXCLUDE_RX.test(title) || ONLINE_RE.test(title)) continue
        const price = stripHtml(b.match(/(\d+[.,]\d{2}\s*€|Free)/i)?.[1] ?? '')
        out.push({
          source: SPREE.name,
          source_id: `urbanspree-${href.split('/').pop()?.replace(/\.html$/, '')}-${start.slice(0, 10)}`,
          source_url: href,
          title,
          description: `${label} at Urban Spree, Berlin-Friedrichshain (gallery, bookshop and concert hall in the RAW compound).`,
          organizer: SPREE.org,
          location_name: `${SPREE.org}, ${SPREE.address}`,
          lat: SPREE.lat,
          lng: SPREE.lng,
          starts_at: start,
          ends_at: null,
          cost: /free/i.test(price) ? 'Free' : price || 'See event page',
        })
      }
      if (!anyFuture) break // newest first: nothing upcoming on this page → stop
    }
  }
  return out.slice(0, MAX_PER_SPACE)
}

// ── Klunkerkranich (event cards) ───────────────────────────────────────────

async function fetchKlunker(): Promise<RawEvent[]> {
  const html = await getText('https://klunkerkranich.org/events/')
  if (!html) return []
  const out: RawEvent[] = []
  for (const m of html.matchAll(/<article [^>]*class="o-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g)) {
    const b = m[1]
    const href = b.match(/href="(https:\/\/klunkerkranich\.org\/events\/(\d{4})-(\d{2})-(\d{2})-[^"]+)"/)
    const title = stripHtml(b.match(/<h2 class="o-card__title">([\s\S]*?)<\/h2>/)?.[1] ?? '')
    const labels = [...b.matchAll(/o-card__image-label">([\s\S]*?)<\/div>/g)].map((x) => stripHtml(x[1])).join(', ')
    const time = stripHtml(b.match(/o-card__meta--secondary">([\s\S]*?)<\/div>/)?.[1] ?? '').match(/(\d{1,2}):(\d{2})(?:\s*[—–-]\s*(\d{1,2}):(\d{2}))?/)
    if (!href || !title || !time) continue
    if (/club/i.test(labels) || EXCLUDE_RX.test(title)) continue
    const [y, mo, d] = [+href[2], +href[3], +href[4]]
    const start = zonedIso(TZ, y, mo, d, +time[1], +time[2])
    if (!future(start)) continue
    let end = time[3] ? zonedIso(TZ, y, mo, d, +time[3], +time[4]) : null
    if (end && end <= start) end = new Date(Date.parse(end) + 864e5).toISOString() // past midnight
    out.push({
      source: KLUNKER.name,
      source_id: `klunker-${href[1].replace(/\/$/, '').split('/').pop()}`,
      source_url: href[1],
      title,
      description: `${labels ? `${labels} — ` : ''}Klunkerkranich, the rooftop garden & culture space on the Neukölln Arcaden.`,
      organizer: KLUNKER.org,
      location_name: `${KLUNKER.org}, ${KLUNKER.address}`,
      lat: KLUNKER.lat,
      lng: KLUNKER.lng,
      starts_at: start,
      ends_at: end,
      cost: 'See event page',
    })
  }
  return out.slice(0, MAX_PER_SPACE)
}

export const deArtSpaces: SourceFetcher = {
  name: 'de-art-spaces',
  async fetch() {
    const prinz = await fetchPrinz()
    const holz = await fetchHolzmarkt()
    const spree = await fetchUrbanSpree()
    const klunker = await fetchKlunker()
    return [...prinz, ...holz, ...spree, ...klunker]
  },
}
