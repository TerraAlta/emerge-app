/**
 * Landworkers' Alliance — UK small-scale farmer, grower and forester union.
 *
 * The LWA website's /events and /calendar pages just embed their Ticket
 * Tailor box office (https://www.tickettailor.com/events/lwa), so we read
 * that directly: the listing page links every event, and each event page
 * carries a schema.org Event in JSON-LD (startDate with offset, location,
 * offers, attendance mode). Online events (Zoom webinars etc.) are skipped.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'landworkers-uk'
const TT = 'https://www.tickettailor.com'
const BOX_OFFICE = `${TT}/events/lwa`
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
const TIMEOUT = 20000
const MAX_DETAIL = 15

export const landworkersUk: SourceFetcher = {
  name: SRC,
  fetch: () => scrapeTicketTailor(BOX_OFFICE),
}

/** Read every in-person event from a Ticket Tailor box office listing. */
export async function scrapeTicketTailor(boxOfficeUrl: string): Promise<RawEvent[]> {
  const html = await get(boxOfficeUrl)
  if (!html) return []
  const $ = load(html)
  const links = new Set<string>()
  $('a.event__link, .event__title a').each((_, a) => {
    const href = $(a).attr('href')
    if (href && /\/events\/[^/]+\/\d+/.test(href)) links.add(href.startsWith('http') ? href : `${TT}${href}`)
  })

  const events: RawEvent[] = []
  for (const url of [...links].slice(0, MAX_DETAIL)) {
    const page = await get(url)
    if (!page) continue
    const ev = findEvent(page)
    if (!ev?.name || !ev.startDate) continue

    const start = new Date(ev.startDate)
    if (isNaN(start.getTime()) || start.getTime() < Date.now()) continue
    const end = ev.endDate ? new Date(ev.endDate) : null

    // In-person only
    const locs = Array.isArray(ev.location) ? ev.location : [ev.location]
    const place = locs.find((l: any) => l && l['@type'] === 'Place')
    if (!place || /OnlineEventAttendanceMode/.test(ev.eventAttendanceMode ?? '')) continue

    const addr = place.address
    const addressText = typeof addr === 'string'
      ? addr
      : [addr?.streetAddress, addr?.addressLocality, addr?.addressRegion, addr?.postalCode, addr?.addressCountry]
          .map((x: any) => (typeof x === 'string' ? x : x?.name))
          .filter((x: any, i: number, arr: any[]) => x && x !== place.name && arr.indexOf(x) === i).join(', ')
    const locationName = [place.name, addressText].filter(Boolean).join(', ')
    if (!locationName) continue

    let lat = parseFloat(place.geo?.latitude)
    let lng = parseFloat(place.geo?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      const geo = await geocode(addressText || locationName)
      if (!geo) continue
      ;({ lat, lng } = geo)
    }

    const offers = Array.isArray(ev.offers) ? ev.offers : ev.offers ? [ev.offers] : []
    const prices = offers.map((o: any) => parseFloat(o.price)).filter((p: number) => Number.isFinite(p))
    const cost = prices.length === 0
      ? 'See event page'
      : Math.max(...prices) === 0 ? 'Free' : `£${Math.min(...prices)}${prices.length > 1 && Math.max(...prices) !== Math.min(...prices) ? `–£${Math.max(...prices)}` : ''}`

    const image = Array.isArray(ev.image) ? ev.image[0] : typeof ev.image === 'string' ? ev.image : ev.image?.url

    events.push({
      source: SRC,
      source_id: `lwa-tt-${url.match(/(\d+)\/?$/)?.[1] ?? hashStr(url)}`,
      source_url: url,
      title: stripHtml(ev.name),
      description: stripHtml(ev.description ?? '').slice(0, 500),
      organizer: stripHtml(ev.organizer?.name ?? "Landworkers' Alliance"),
      location_name: locationName,
      lat, lng,
      starts_at: start.toISOString(),
      ends_at: end && !isNaN(end.getTime()) ? end.toISOString() : null,
      cost,
      image_url: image ?? null,
    })
  }
  return events
}

function findEvent(html: string): any | null {
  const $ = load(html)
  let found: any = null
  $('script[type="application/ld+json"]').each((_, s) => {
    if (found) return
    try {
      const data = JSON.parse($(s).contents().text())
      const items = Array.isArray(data) ? data : data['@graph'] ?? [data]
      found = items.find((i: any) => i?.['@type'] === 'Event') ?? null
    } catch { /* skip */ }
  })
  return found
}

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT),
    })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const pc = address.match(UK_POSTCODE)
  if (pc) {
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc[1] + pc[2])}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT),
      })
      if (res.ok) {
        const d = await res.json()
        if (d.result?.latitude && d.result?.longitude) return { lat: d.result.latitude, lng: d.result.longitude }
      }
    } catch { /* fall through */ }
  }
  await new Promise(r => setTimeout(r, 1100)) // Nominatim: max 1 req/s
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(TIMEOUT) },
    )
    if (res.ok) {
      const d = await res.json()
      if (d[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
    }
  } catch { /* give up */ }
  return null
}
