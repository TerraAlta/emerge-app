/**
 * Toekomstboeren — toekomstboeren.nl
 * Dutch network of agroecological (future) farmers: Boerenvuren,
 * Boerenwerkplaatsen, excursions, conferences, harvest feasts.
 *
 * /agenda/ lists "Aankomende bijeenkomsten" (upcoming) above "Eerdere
 * bijeenkomsten" (past). Each upcoming item links to a /bijeenkomsten/<slug>/
 * page whose JetEngine fields give date ("9 oktober 2026"), start time
 * ("13:45") and place ("Groente Amsterdammer, Beverwijk"); the body usually
 * has a fuller "Waar: …" address. The REST API (wp/v2/bijeenkomsten) has no
 * date meta, so we read the pages. Geocoded with Nominatim (≥1.1 s apart,
 * cached); items with an unknown place ("t.b.a.") or online are skipped.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'toekomstboeren-nl'
const ORG = 'Toekomstboeren'
const AGENDA = 'https://toekomstboeren.nl/agenda/'
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const NOMINATIM_UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_DETAIL = 25

const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7,
  augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function amsOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Amsterdam', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** Europe/Amsterdam wall-clock time → UTC ISO string (also fine for CET neighbours) */
function amsIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - amsOffsetMin(guess) * 60000).toISOString()
}

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastNominatim = 0
async function nominatim(q: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache.has(q)) return geoCache.get(q)!
  const wait = lastNominatim + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastNominatim = Date.now()
  let out: { lat: number; lng: number } | null = null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'nl' }, signal: AbortSignal.timeout(15000) },
    )
    if (res.ok) {
      const d = await res.json()
      if (d[0]) out = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
    }
  } catch { /* none */ }
  // Europe only
  if (out && !(out.lat > 35 && out.lat < 72 && out.lng > -25 && out.lng < 45)) out = null
  geoCache.set(q, out)
  return out
}

interface Detail {
  date: [number, number, number]
  time: [number, number] | null
  place: string
  address: string | null
  topic: string
  description: string
  image: string | null
}

function parseDetail(html: string): Detail | null {
  const fields = [...html.matchAll(/jet-listing-dynamic-field__content"\s*>([\s\S]*?)<\/div>/g)]
    .map((m) => stripHtml(m[1])).filter(Boolean)
  let date: [number, number, number] | null = null
  let time: [number, number] | null = null
  let place = ''
  for (const f of fields) {
    const dm = f.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i)
    const tm = f.match(/^(\d{1,2})[:.](\d{2})$/)
    if (!date && dm && MONTHS[dm[2].toLowerCase()]) { date = [+dm[3], MONTHS[dm[2].toLowerCase()], +dm[1]]; continue }
    if (!time && tm) { time = [+tm[1], +tm[2]]; continue }
    if (date && !place && !/^bijeenkomsten$/i.test(f)) place = f
  }
  if (!date) return null

  // Body text only (the header has a search box: "Waar ben je naar op zoek?")
  const body = html.slice(Math.max(0, html.indexOf('jet-listing-dynamic-field__content')))
  const text = stripHtml(body.replace(/<(br|p|div|li|h\d)[^>]*>/gi, ' | '))
  // "📍 | Waar: | Groente Amsterdammer: Pad van Altruda 1 – 1948 PJ – Beverwijk"
  const waar = text.match(/\bWaar\s*[?:]\s*(?:\|\s*)?:?\s*(?:\|\s*)?([^|]{6,160})/i)?.[1]?.trim() ?? null
  const topic = stripHtml(html.match(/class="jet-listing-dynamic-terms__link">([^<]*)</)?.[1] ?? '')
  const description = [...body.matchAll(/<p class="wp-block-paragraph">([\s\S]*?)<\/p>/g)]
    .map((m) => stripHtml(m[1])).filter((p) => p.length > 40).slice(0, 2).join(' ')
  const image = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1] ?? null
  return { date, time, place, address: waar, topic, description, image }
}

/** Geocoder queries, most specific first, each with the label to show */
function geoQueries(d: Detail): Array<{ q: string; label: string }> {
  const qs: Array<{ q: string; label: string }> = []
  const addr = d.address?.replace(/^[\s–-]+/, '').trim()
  // Ignore "Waar" lines that are really dates/times
  if (addr && !/\d{1,2}[:.]\d{2}|\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(addr)) {
    // "Groente Amsterdammer: Pad van Altruda 1 – 1948 PJ – Beverwijk"
    const a = addr.replace(/^[^:]{2,60}:\s*/, '').replace(/\s+[–-]\s+/g, ', ').replace(/\s+in\s+/g, ', ')
    qs.push({ q: a, label: addr })
    const zipTown = a.match(/\b(\d{4}\s?[A-Z]{2})\b[,\s]+([A-Z][\w'’ -]+)/)
    if (zipTown) qs.push({ q: `${zipTown[1]} ${zipTown[2]}`, label: addr })
  }
  if (d.place) {
    qs.push({ q: d.place, label: d.place })
    const parts = d.place.split(/,| in | te /).map((s) => s.trim()).filter(Boolean)
    if (parts.length > 1) qs.push({ q: parts.slice(1).join(', '), label: d.place })
  }
  const seen = new Set<string>()
  return qs.filter((x) => x.q.length > 2 && !seen.has(x.q) && seen.add(x.q))
}

export const toekomstboerenNl: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(AGENDA)
    if (!html) return []
    const start = html.indexOf('Aankomende bijeenkomsten')
    const end = html.indexOf('Eerdere bijeenkomsten')
    if (start < 0) return []
    const section = html.slice(start, end > start ? end : undefined)
    const links = [...new Set([...section.matchAll(/href="(https:\/\/toekomstboeren\.nl\/bijeenkomsten\/[^"#?]+)"/g)].map((m) => m[1]))]
      .slice(0, MAX_DETAIL)

    const now = Date.now()
    const events: RawEvent[] = []
    for (const url of links) {
      const page = await getText(url)
      if (!page) continue
      const d = parseDetail(page)
      if (!d) continue
      const title = stripHtml(page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? page.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s*[–-]\s*Toekomstboeren\s*$/, '') ?? '')
      if (!title) continue
      if (/\b(online|webinar|zoom)\b/i.test(`${title} ${d.place} ${d.topic}`)) continue
      if (!d.place || /t\.?b\.?a\.?|nog niet bekend|volgt/i.test(d.place)) continue

      const [y, mo, day] = d.date
      const [h, mi] = d.time ?? [10, 0]
      const startsAt = amsIso(y, mo, day, h, mi)
      if (Date.parse(startsAt) < now + 3600_000) continue

      let geo: { lat: number; lng: number } | null = null
      let label = d.place
      for (const { q, label: l } of geoQueries(d)) {
        geo = await nominatim(q)
        if (geo) { label = l; break }
      }
      if (!geo) continue

      const slug = url.replace(/\/$/, '').split('/').pop()
      events.push({
        source: SRC,
        source_id: `tb-${slug}`,
        source_url: url,
        title: title.replace(/^Save the date:\s*/i, ''),
        description: [d.topic ? `${d.topic}.` : '', d.description].filter(Boolean).join(' ').slice(0, 500)
          || `${ORG} bijeenkomst.`,
        organizer: ORG,
        location_name: label.slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startsAt,
        ends_at: null,
        cost: 'Zie website',
        image_url: d.image,
      })
    }
    return events
  },
}
