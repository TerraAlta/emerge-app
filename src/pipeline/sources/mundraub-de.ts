/**
 * Mundraub — mundraub.org
 * Germany's community foraging map. Besides the (undated) map of fruit trees,
 * users publish "Aktionen": harvest actions, planting/care days, foraging
 * tours, apple festivals… each with a date, an address and coordinates.
 *
 * There is no public listing page, but every action is in the Drupal
 * sitemap (https://mundraub.org/sitemap.xml?page=1, /aktionen/<slug> with
 * <lastmod>). We take the most recently created/edited actions and read each
 * detail page:
 *   - date:   .field-action-date <time datetime="…Z"> (UTC)
 *   - place:  .field-action-address (road / plz / city)
 *   - coords: <Point><coordinates>lng,lat</coordinates></Point>
 *   - type:   .field-action-category .tag (Ernteaktion, Pflanzen & Pflegen, …)
 * Map markers (trees) are places, not events, and are NOT emitted.
 * Requests: 1 sitemap + ≤ 25 detail pages, sequential.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities } from './utils'

const SRC = 'mundraub-de'
const BASE = 'https://mundraub.org'
const SITEMAP = `${BASE}/sitemap.xml?page=1`
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_DETAIL = 25
const RECENT_DAYS = 75

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** Actions in the sitemap, newest lastmod first. */
function actionUrls(xml: string): { url: string; lastmod: number }[] {
  const out: { url: string; lastmod: number }[] = []
  const rx = /<loc>\s*([^<\s]*\/aktionen\/[^<\s]+)\s*<\/loc>\s*(?:<lastmod>\s*([^<\s]+)\s*<\/lastmod>)?/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(xml)) !== null) {
    const lm = m[2] ? Date.parse(m[2]) : NaN
    out.push({ url: decodeEntities(m[1]), lastmod: Number.isFinite(lm) ? lm : 0 })
  }
  return out.sort((a, b) => b.lastmod - a.lastmod)
}

function parseAction(html: string, url: string): RawEvent | null {
  const dateBlock = html.match(/field-action-date[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? ''
  const times = [...dateBlock.matchAll(/<time datetime="([^"]+)"/g)].map((t) => Date.parse(t[1]))
    .filter((t) => Number.isFinite(t))
  if (!times.length) return null
  const start = times[0]
  const end = times.length > 1 && times[1] > start ? times[1] : null

  const coords = html.match(/(?:<|&lt;)coordinates(?:>|&gt;)\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  if (!coords) return null
  const lng = parseFloat(coords[1])
  const lat = parseFloat(coords[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null

  const title = stripHtml(
    html.match(/<article[^>]*action-full[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ??
      html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ??
      '',
  ).trim()
  if (!title) return null

  const category = stripHtml(html.match(/field-action-category[\s\S]*?<div class="tag">([\s\S]*?)<\/div>/)?.[1] ?? '').trim()
  const body = stripHtml((html.match(/<div class="field body[\s\S]*?<div class="content[^"]*">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? '').replace(/<\/p>|<br\s*\/?>/gi, ' '))
  if (/\b(online|webinar|zoom)\b/i.test(title)) return null

  const ai = html.indexOf('field-action-address')
  const addrBlock = ai >= 0 ? html.slice(ai, ai + 2000) : ''
  const part = (cls: string) => stripHtml(addrBlock.match(new RegExp(`class="address ${cls}[^"]*">([\\s\\S]*?)<\\/div>`))?.[1] ?? '').trim()
  const road = part('road')
  const plz = part('plz')
  const city = part('city')
  const locationName = [road, [plz, city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Deutschland'

  const nid = html.match(/data-history-node-id="(\d+)"/)?.[1]
  const img = html.match(/<div class="field field-image[\s\S]*?\ssrc="([^"]+)"/)?.[1]

  return {
    source: SRC,
    source_id: `mundraub-action-${nid ?? url.split('/').pop()}`,
    source_url: url,
    title: category && !/sonstige/i.test(category) ? `${title} (${decodeEntities(category)})` : title,
    description: (body || `${category || 'Aktion'} der mundraub-Community.`).slice(0, 1500),
    organizer: 'mundraub-Community',
    location_name: locationName,
    lat,
    lng,
    starts_at: new Date(start).toISOString(),
    ends_at: end ? new Date(end).toISOString() : null,
    cost: 'Free',
    image_url: img ? new URL(decodeEntities(img), BASE).toString() : null,
  }
}

export const mundraubDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const xml = await getText(SITEMAP)
    if (!xml) {
      console.warn(`[${SRC}] sitemap unavailable`)
      return []
    }
    const cutoff = Date.now() - RECENT_DAYS * 86400e3
    const candidates = actionUrls(xml).filter((a) => a.lastmod >= cutoff).slice(0, MAX_DETAIL)

    const out: RawEvent[] = []
    for (const c of candidates) {
      const html = await getText(c.url)
      if (!html) continue
      const ev = parseAction(html, c.url)
      if (ev) out.push(ev)
    }
    return out
  },
}
