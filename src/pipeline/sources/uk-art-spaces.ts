/**
 * UK community art spaces — Fruitmarket (Edinburgh), Spike Island (Bristol).
 *
 * - Fruitmarket: The Events Calendar REST API
 *   (/wp-json/tribe/events/v1/events) with Europe/London times and categories
 *   (workshops, book launches, music, makers markets). Events carry no venue,
 *   so they use the gallery (45 Market Street, Edinburgh).
 * - Spike Island: /programme/events/ renders the upcoming events as cards
 *   ("Thursday 22 October 2026, 10–11.30am, Free, booking advised"); events
 *   are at the venue (133 Cumberland Road, Bristol).
 * - Assemble (assemblestudio.co.uk) was dropped: the site is a project
 *   portfolio with no events page.
 *
 * Club nights / DJ sets / online events are dropped; times are Europe/London.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, getJson, zonedIso, enMonth, parseTimeRange, ONLINE_RE } from './misc-common'

const TZ = 'Europe/London'
const MAX_PER_SPACE = 100
const EXCLUDE_RX = /club night|dj set|\bdjs?\b|techno|house music|\brave\b|corporate|sponsor|\bVIP\b/i

const FRUITMARKET = { name: 'fruitmarket', org: 'Fruitmarket', address: '45 Market Street, Edinburgh EH1 1DF', lat: 55.95126, lng: -3.18996 }
const SPIKE = { name: 'spike-island', org: 'Spike Island', address: '133 Cumberland Road, Bristol BS1 6UX', lat: 51.44708, lng: -2.61062 }

const future = (iso: string | null | undefined): iso is string => !!iso && Date.parse(iso) > Date.now() + 3600_000

function utcStamp(s: string | undefined): string | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString() : null
}

async function fetchFruitmarket(): Promise<RawEvent[]> {
  const today = new Date().toISOString().slice(0, 10)
  const d = await getJson<any>(`https://www.fruitmarket.co.uk/wp-json/tribe/events/v1/events?per_page=100&start_date=${today}`)
  const out: RawEvent[] = []
  for (const e of d?.events ?? []) {
    const title = stripHtml(e.title ?? '')
    const desc = stripHtml(e.description ?? e.excerpt ?? '')
    if (!title || EXCLUDE_RX.test(title) || ONLINE_RE.test(title)) continue
    // All-day items get 10:00 local; timed ones use the UTC fields.
    let start = utcStamp(e.utc_start_date)
    if (e.all_day) {
      const m = String(e.start_date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
      start = m ? zonedIso(TZ, +m[1], +m[2], +m[3], 10, 0) : null
    }
    if (!future(start)) continue
    const end = e.all_day ? null : utcStamp(e.utc_end_date)
    const cats = (e.categories ?? []).map((c: any) => c.name).filter((n: string) => n && n !== 'Homepage')
    out.push({
      source: FRUITMARKET.name,
      source_id: `fruitmarket-${e.id}`,
      source_url: e.url ?? 'https://www.fruitmarket.co.uk/whats-on/',
      title,
      description: (desc || `${cats.join(', ')} at Fruitmarket, Edinburgh.`).slice(0, 500),
      organizer: FRUITMARKET.org,
      location_name: `${FRUITMARKET.org}, ${FRUITMARKET.address}`,
      lat: FRUITMARKET.lat,
      lng: FRUITMARKET.lng,
      starts_at: start,
      ends_at: end && end > start ? end : null,
      cost: stripHtml(e.cost ?? '') || 'See event page',
      image_url: e.image?.url ?? null,
    })
    if (out.length >= MAX_PER_SPACE) break
  }
  return out
}

async function fetchSpikeIsland(): Promise<RawEvent[]> {
  const html = await getText('https://www.spikeisland.org.uk/programme/events/')
  if (!html) return []
  const out: RawEvent[] = []
  for (const m of html.matchAll(/<a href="(https:\/\/www\.spikeisland\.org\.uk\/programme\/events\/[^"]+)" class="card\s+events">([\s\S]*?)<\/a>\s*<\/div>/g)) {
    const url = m[1]
    const b = m[2]
    const title = stripHtml(b.match(/<h4 class="card__title[^"]*">([\s\S]*?)<\/h4>/)?.[1] ?? '')
    const when = stripHtml(b.match(/<span class="card__date-range[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? '')
    // "Thursday 22 October 2026, 10–11.30am, Free, booking advised"
    const dm = when.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s*[-–]\s*[^,]*)?,?\s*(.*)$/)
    const mo = enMonth(dm?.[2])
    if (!title || !dm || !mo || EXCLUDE_RX.test(title) || ONLINE_RE.test(`${title} ${when}`)) continue
    const rest = dm[4] ?? ''
    const [st, en] = parseTimeRange(rest.split(',')[0] ?? '')
    const start = zonedIso(TZ, +dm[3], mo, +dm[1], st?.[0] ?? 10, st?.[1] ?? 0)
    if (!future(start)) continue
    let end = en ? zonedIso(TZ, +dm[3], mo, +dm[1], en[0], en[1]) : null
    if (end && end <= start) end = null
    const costTxt = rest.split(',').slice(1).join(',').trim()
    out.push({
      source: SPIKE.name,
      source_id: `spike-${url.replace(/\/$/, '').split('/').pop()}-${start.slice(0, 10)}`,
      source_url: url,
      title,
      description: `${when}. Spike Island, Bristol — artists' studios, gallery and workspace.`.slice(0, 500),
      organizer: SPIKE.org,
      location_name: `${SPIKE.org}, ${SPIKE.address}`,
      lat: SPIKE.lat,
      lng: SPIKE.lng,
      starts_at: start,
      ends_at: end,
      cost: /^free/i.test(costTxt) ? 'Free' : /fully booked/i.test(costTxt) ? 'Fully booked' : costTxt.slice(0, 60) || 'See event page',
    })
    if (out.length >= MAX_PER_SPACE) break
  }
  return out
}

export const ukArtSpaces: SourceFetcher = {
  name: 'uk-art-spaces',
  async fetch() {
    const fruit = await fetchFruitmarket()
    const spike = await fetchSpikeIsland()
    return [...fruit, ...spike]
  },
}
