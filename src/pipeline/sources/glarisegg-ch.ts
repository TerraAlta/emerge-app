/**
 * Schloss Glarisegg — glarisegg.ch
 * Seminars, workshops, events at Lake Constance community.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractMultiDate, geocodeSwiss } from './ch-mt-utils'

const BASE = 'https://www.glarisegg.ch'
const URLS = [`${BASE}/veranstaltungen/`, `${BASE}/events/`]
const DEFAULT_LAT = 47.6667, DEFAULT_LNG = 9.0833

export const glariseggCh: SourceFetcher = {
  name: 'glarisegg-ch',
  async fetch() {
    // Try Tribe Events API
    try {
      const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (apiRes.ok) {
        const data = await apiRes.json()
        if (data.events?.length > 0) {
          return data.events.map((e: any) => ({
            source: 'glarisegg-ch', source_id: `gl-ch-${e.id}`,
            source_url: e.url ?? URLS[0], title: stripHtml(e.title ?? ''),
            description: stripHtml(e.description ?? '').slice(0, 500),
            organizer: e.organizer?.[0]?.organizer ?? 'Schloss Glarisegg',
            location_name: e.venue?.venue ?? 'Schloss Glarisegg',
            lat: parseFloat(e.venue?.geo_lat ?? '0') || DEFAULT_LAT,
            lng: parseFloat(e.venue?.geo_lng ?? '0') || DEFAULT_LNG,
            starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'Siehe Veranstaltung',
          }))
        }
      }
    } catch {}

    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()
        const jsonLd = extractJsonLd(html, 'glarisegg-ch')
        if (jsonLd.length > 0) return jsonLd
        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|veranstaltung|seminar|workshop|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const geo = geocodeSwiss(block)
    events.push({
      source: 'glarisegg-ch', source_id: `gl-ch-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl, title,
      description: 'Schloss Glarisegg Veranstaltung.', organizer: 'Schloss Glarisegg',
      location_name: 'Schloss Glarisegg, Bodensee',
      lat: geo?.lat || DEFAULT_LAT, lng: geo?.lng || DEFAULT_LNG,
      starts_at: extractMultiDate(block), cost: 'Siehe Veranstaltung',
    })
  }
  return events
}
