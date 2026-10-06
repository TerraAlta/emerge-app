/**
 * FIC — Foundation for Intentional Community — ic.org
 *
 * The community directory is a list of places, not events, so we don't use
 * it. Dated events live in "Needs & Offers", category Events
 * (/engage/needs-and-offers/?type=needs-and-offers&category=events), a
 * Voxel-theme feed that is server-rendered: each card is a .ts-preview with
 * data-post-id, a data-position="lat,lng" and a link to the post. Each post
 * page lists its sessions as Google Calendar "add to calendar" links, which
 * carry the exact local start/end (dates=YYYYMMDDTHHMMSS/...), location and
 * zone (ctz=...). One RawEvent per session.
 *
 * Note: ctz appears to be the site-wide zone (America/Chicago) rather than
 * the venue's; we use it as given since it's the only zone in the data.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'fic-na'
const BASE = 'https://www.ic.org'
const LIST = `${BASE}/engage/needs-and-offers/?type=needs-and-offers&category=events`
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0; +https://emerge.terralta.org)'
const NOMINATIM_UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const ORG = 'Foundation for Intentional Community'
const MAX_LIST_PAGES = 4
const MAX_POSTS = 18
const MAX_EVENTS = 200

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(url: string): Promise<string | null> {
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

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15000) },
    )
    if (!res.ok) return null
    const d = await res.json()
    return d[0] ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) } : null
  } catch {
    return null
  }
}

function tzOffsetMin(ts: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** "20261113T090000" (local in tz) or "20261113T150000Z" → ISO; date-only → local midnight */
function gcalIso(s: string, tz: string): string | null {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/)
  if (!m) return null
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  if (m[7]) return new Date(utc).toISOString()
  try {
    return new Date(utc - tzOffsetMin(utc, tz) * 60000).toISOString()
  } catch {
    return null
  }
}

interface Card { id: string; url: string; lat: number | null; lng: number | null }

function parseList(html: string): Card[] {
  const $ = load(html)
  const out: Card[] = []
  $('.sf-post-feed .ts-preview[data-post-id], .ts-post-feed .ts-preview[data-post-id]').each((_, el) => {
    const card = $(el)
    const id = card.attr('data-post-id') ?? ''
    const url = card.find('a[href*="/engage/needs-and-offers/"]').first().attr('href') ?? ''
    if (!id || !/\/needs-and-offers\/[^/?]+\/[^/?]+\/?$/.test(url)) return
    const pos = (card.find('[data-position]').first().attr('data-position') ?? '').split(',').map(parseFloat)
    const ok = pos.length === 2 && pos.every(Number.isFinite) && !(pos[0] === 0 && pos[1] === 0)
    out.push({ id, url, lat: ok ? pos[0] : null, lng: ok ? pos[1] : null })
  })
  return out
}

export const ficNa: SourceFetcher = {
  name: SRC,
  async fetch() {
    // 1. Listing pages (server-rendered; Voxel paginates with &pg=N)
    const cards: Card[] = []
    const seen = new Set<string>()
    for (let pg = 1; pg <= MAX_LIST_PAGES; pg++) {
      const html = await get(pg === 1 ? LIST : `${LIST}&pg=${pg}`)
      if (!html) break
      const fresh = parseList(html).filter((c) => !seen.has(c.id))
      if (fresh.length === 0) break
      for (const c of fresh) { seen.add(c.id); cards.push(c) }
    }

    // 2. Each post's Google Calendar links → sessions
    const events: RawEvent[] = []
    const geoCache = new Map<string, { lat: number; lng: number } | null>()
    for (const card of cards.slice(0, MAX_POSTS)) {
      const html = await get(card.url)
      if (!html) continue
      const $ = load(html)
      const ogTitle = $('meta[property="og:title"]').attr('content') ?? ''
      const pageTitle = stripHtml(ogTitle.replace(/\s*-\s*Foundation for Intentional Community\s*$/, ''))
      const image = $('meta[property="og:image"]').attr('content') ?? null
      // The gcal links don't escape '&' inside text/details, so the page's
      // own meta is the reliable source for title and description.
      const pageDesc = stripHtml($('meta[property="og:description"]').attr('content')
        ?? $('meta[name="description"]').attr('content') ?? '')

      const links = $('a[href^="https://calendar.google.com/calendar/render"]').toArray()
      const done = new Set<string>()
      for (const a of links) {
        let u: URL
        try { u = new URL($(a).attr('href') ?? '') } catch { continue }
        const dates = u.searchParams.get('dates') ?? ''
        if (done.has(dates)) continue
        done.add(dates)
        const [s, e] = dates.split('/')
        const tz = u.searchParams.get('ctz') || 'America/Chicago'
        const startsAt = s ? gcalIso(s, tz) : null
        if (!startsAt) continue
        const title = pageTitle || stripHtml(u.searchParams.get('text') ?? '')
        if (!title) continue
        const location = stripHtml(u.searchParams.get('location') ?? '')
        const details = stripHtml(u.searchParams.get('details') ?? '')
        if (/\b(online|virtual|webinar|zoom)\b/i.test(`${title} ${location}`)) continue
        if (!location && /\b(zoom|online)\b/i.test(details)) continue

        let lat = card.lat
        let lng = card.lng
        if (lat === null || lng === null) {
          if (!location) continue
          if (!geoCache.has(location)) {
            if (geoCache.size > 0) await sleep(1100)
            geoCache.set(location, await geocode(location))
          }
          const g = geoCache.get(location)
          if (!g) continue
          lat = g.lat
          lng = g.lng
        }

        events.push({
          source: SRC,
          source_id: `fic-${card.id}-${s}`,
          source_url: card.url,
          title,
          description: (pageDesc || details).slice(0, 500),
          organizer: ORG,
          location_name: location || 'See event page',
          lat,
          lng,
          starts_at: startsAt,
          ends_at: e ? gcalIso(e, tz) : null,
          cost: 'See event page',
          image_url: image,
        })
        if (events.length >= MAX_EVENTS) return events
      }
    }
    return events
  },
}
