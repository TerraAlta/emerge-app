/**
 * Woodland Trust — woodlandtrust.org.uk
 * UK's largest woodland conservation charity. Guided walks, workshops and
 * family events at its own woods across the UK.
 *
 * The public listing is a server-rendered Umbraco page
 * (/visiting-woods/things-to-do/events/) — no JSON API, no JSON-LD. Each card
 * carries title, summary, image and "Sat 10 Oct 2026 • Venue, Town". The
 * detail page adds the time ("Date: Saturday 10 October, 11am–1pm."), the
 * price and a postcode, which we geocode with postcodes.io (free, keyless).
 * If the detail page fails we fall back to geocoding the town name; if that
 * fails too the event is skipped rather than given fake coordinates.
 *
 * The site is slow (detail pages can take ~15s) and returns "The service is
 * unavailable" under bursts, so requests are strictly sequential.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'woodland-trust-uk'
const BASE = 'https://www.woodlandtrust.org.uk'
const LIST_URL = `${BASE}/visiting-woods/things-to-do/events/`
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
const MAX_DETAIL = 30
const MAX_EVENTS = 200

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

async function get(url: string, timeout = 20000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** Minutes east of UTC for Europe/London at the given instant. */
function londonOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return Math.round((asUtc - ts) / 60000)
}

/** UK wall-clock time → ISO string. */
function londonIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - londonOffsetMin(guess) * 60000).toISOString()
}

/** "11am–1pm", "1–4pm", "10.30am - 12.30pm" → start/end in 24h. */
function parseTimeRange(s: string): { sh: number; sm: number; eh?: number; em?: number } | null {
  const range = s.match(/(\d{1,2})(?:[:.](\d\d))?\s*(am|pm)?\s*(?:–|-|—|to)\s*(\d{1,2})(?:[:.](\d\d))?\s*(am|pm)/i)
  const to24 = (h: number, mer: string) => (mer === 'pm' ? (h % 12) + 12 : h % 12)
  if (range) {
    const endMer = range[6].toLowerCase()
    const eh = to24(+range[4], endMer)
    let startMer = range[3]?.toLowerCase()
    if (!startMer) startMer = endMer === 'pm' && +range[1] % 12 > +range[4] % 12 ? 'am' : endMer
    return { sh: to24(+range[1], startMer), sm: +(range[2] ?? 0), eh, em: +(range[5] ?? 0) }
  }
  const single = s.match(/(\d{1,2})(?:[:.](\d\d))?\s*(am|pm)/i)
  if (single) return { sh: to24(+single[1], single[3].toLowerCase()), sm: +(single[2] ?? 0) }
  return null
}

interface Card {
  url: string
  title: string
  summary: string
  image: string | null
  y: number; mo: number; d: number
  venue: string
}

interface Detail {
  time: ReturnType<typeof parseTimeRange>
  postcode: string | null
  location: string | null
  price: string | null
}

function parseDetail(html: string): Detail {
  const $ = load(html)
  const out: Detail = { time: null, postcode: null, location: null, price: null }
  $('li').each((_, li) => {
    const label = $(li).find('strong').first().text().replace(/\s+/g, ' ').trim().toLowerCase()
    const text = $(li).text().replace(/\s+/g, ' ').trim()
    const value = text.replace(/^[^:]*:\s*/, '')
    if (!out.time && /^(date|dates|time|when)\b/.test(label)) out.time = parseTimeRange(value)
    if (!out.location && /^(location|where|venue)\b/.test(label)) {
      out.location = value.split(/what ?3 ?words|grid reference/i)[0].replace(/[.\s]+$/, '')
      const pc = out.location.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/)
      if (pc) out.postcode = `${pc[1]} ${pc[2]}`
    }
    if (!out.price && /^(price|cost)\b/.test(label)) out.price = value
  })
  return out
}

async function geocodePostcodes(pcs: string[]): Promise<Map<string, [number, number]>> {
  const out = new Map<string, [number, number]>()
  if (pcs.length === 0) return out
  try {
    const res = await fetch('https://api.postcodes.io/postcodes', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: pcs.slice(0, 100) }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return out
    const data = await res.json()
    for (const r of data.result ?? []) {
      if (r.result?.latitude && r.result?.longitude) out.set(r.query, [r.result.latitude, r.result.longitude])
    }
  } catch { /* ignore */ }
  return out
}

async function geocodePlace(name: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(name)}&limit=1`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const r = (await res.json()).result?.[0]
    return r?.latitude && r?.longitude ? [r.latitude, r.longitude] : null
  } catch {
    return null
  }
}

export const woodlandTrustUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await get(LIST_URL)
    if (!html) {
      console.warn(`[${SRC}] listing fetch failed`)
      return []
    }
    const $ = load(html)
    const cards: Card[] = []
    const seen = new Set<string>()
    $('a.excerpt-link').each((_, a) => {
      const href = $(a).attr('href') ?? ''
      if (!/\/things-to-do\/events\/[^/]+\/?$/.test(href)) return
      const url = new URL(href, BASE).toString()
      if (seen.has(url)) return
      const title = stripHtml($(a).find('.excerpt-list-card__body__title').text() || $(a).attr('aria-label') || '')
      const bottom = stripHtml($(a).find('.excerpt-list-card__body__bottom-label').html() ?? '')
      // "Sat 10 Oct 2026 • Heartwood Arboretum, Sandridge"
      const dm = bottom.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/)
      if (!title || !dm) return
      const mo = MONTHS[dm[2].toLowerCase()]
      if (!mo) return
      seen.add(url)
      const style = $(a).find('.excerpt-list-card__image--bg').attr('style') ?? ''
      const img = style.match(/url\('([^']+)'\)/)?.[1]
      cards.push({
        url, title,
        summary: stripHtml($(a).find('.excerpt-list-card__body__summary-paragraph').text()),
        image: img ? new URL(img.replace(/&amp;/g, '&'), BASE).toString() : null,
        y: +dm[3], mo, d: +dm[1],
        venue: bottom.split(/[•·]/).slice(1).join(' ').trim(),
      })
    })

    // Drop cards whose date has already passed before spending detail requests
    const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
    const upcoming = cards.filter((c) => Date.UTC(c.y, c.mo - 1, c.d) >= todayUtc).slice(0, MAX_EVENTS)

    const details = new Map<string, Detail>()
    for (const c of upcoming.slice(0, MAX_DETAIL)) {
      const dh = await get(c.url)
      if (dh) details.set(c.url, parseDetail(dh))
    }

    const coords = await geocodePostcodes(
      [...new Set([...details.values()].map((d) => d.postcode).filter((p): p is string => !!p))],
    )

    const events: RawEvent[] = []
    const placeCache = new Map<string, [number, number] | null>()
    for (const c of upcoming) {
      const det = details.get(c.url)
      let ll = det?.postcode ? coords.get(det.postcode) ?? null : null
      if (!ll) {
        // Fall back to the town in the card label ("Heartwood Arboretum, Sandridge" → "Sandridge")
        const town = c.venue.split(',').pop()?.trim()
        if (town) {
          if (!placeCache.has(town)) placeCache.set(town, await geocodePlace(town))
          ll = placeCache.get(town) ?? null
        }
      }
      if (!ll) continue

      const t = det?.time
      const startsAt = t ? londonIso(c.y, c.mo, c.d, t.sh, t.sm) : londonIso(c.y, c.mo, c.d, 10, 0)
      const endsAt = t?.eh !== undefined ? londonIso(c.y, c.mo, c.d, t.eh, t.em ?? 0) : null
      const price = det?.price ?? ''
      events.push({
        source: SRC,
        source_id: `wt-${hashStr(c.url + c.y + c.mo + c.d)}`,
        source_url: c.url,
        title: c.title,
        description: c.summary.slice(0, 500),
        organizer: 'Woodland Trust',
        location_name: det?.location || c.venue || 'Woodland Trust wood',
        lat: ll[0],
        lng: ll[1],
        starts_at: startsAt,
        ends_at: endsAt && endsAt > startsAt ? endsAt : null,
        cost: /^free\b/i.test(price) ? 'Free' : price ? price.replace(/\.$/, '').slice(0, 80) : 'See event page',
        image_url: c.image,
      })
    }
    return events
  },
}
