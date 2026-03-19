/**
 * Regenerative Living Zürich (Advantika) — advantika.ch
 * Workshops, gatherings, regenerative events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractMultiDate, geocodeSwiss } from './ch-mt-utils'

const BASE = 'https://www.advantika.ch'
const URLS = [`${BASE}/events/`, `${BASE}/agenda/`]
const DEFAULT_LAT = 47.3769, DEFAULT_LNG = 8.5417

export const regenZh: SourceFetcher = {
  name: 'regen-zh',
  async fetch() {
    // Try Tribe Events API
    try {
      const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (apiRes.ok) {
        const data = await apiRes.json()
        if (data.events?.length > 0) {
          return data.events.map((e: any) => {
            const geo = geocodeSwiss(e.venue?.city || e.venue?.venue || '')
            return {
              source: 'regen-zh', source_id: `rg-zh-${e.id}`,
              source_url: e.url ?? URLS[0], title: stripHtml(e.title ?? ''),
              description: stripHtml(e.description ?? '').slice(0, 500),
              organizer: e.organizer?.[0]?.organizer ?? 'Regenerative Living Zürich',
              location_name: e.venue?.venue ?? e.venue?.city ?? 'Zürich',
              lat: parseFloat(e.venue?.geo_lat ?? '0') || geo?.lat || DEFAULT_LAT,
              lng: parseFloat(e.venue?.geo_lng ?? '0') || geo?.lng || DEFAULT_LNG,
              starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'Siehe Veranstaltung',
            }
          })
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
        const jsonLd = extractJsonLd(html, 'regen-zh')
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
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|workshop|gathering|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const geo = geocodeSwiss(block)
    events.push({
      source: 'regen-zh', source_id: `rg-zh-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl, title,
      description: 'Regenerative Living Zürich event.', organizer: 'Regenerative Living Zürich',
      location_name: 'Zürich', lat: geo?.lat || DEFAULT_LAT, lng: geo?.lng || DEFAULT_LNG,
      starts_at: extractMultiDate(block), cost: 'Siehe Veranstaltung',
    })
  }
  return events
}
