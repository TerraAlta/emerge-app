/**
 * FIC Global — Fellowship for Intentional Community — ic.org
 * Directory + events. Extends the NA pattern to cover global listings.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://www.ic.org'
const SRC = 'fic-global'
const ORG = 'Fellowship for Intentional Community'

export const ficGlobal: SourceFetcher = {
  name: SRC,
  async fetch() {
    // Strategy 1: WP REST API — directory
    try {
      const res = await fetch(`${BASE}/wp-json/wp/v2/directory?per_page=30`, {
        headers: { 'User-Agent': 'Emerge-App/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          return data.map((c: any) => ({
            source: SRC, source_id: `ficg-${c.id}`,
            source_url: c.link ?? `${BASE}/directory/`,
            title: `Community — ${stripHtml(c.title?.rendered ?? '')}`,
            description: stripHtml(c.excerpt?.rendered ?? '').slice(0, 500),
            organizer: stripHtml(c.title?.rendered ?? ''),
            location_name: c.acf?.location ?? c.acf?.city ?? 'See listing',
            lat: parseFloat(c.acf?.latitude ?? '0'), lng: parseFloat(c.acf?.longitude ?? '0'),
            starts_at: new Date().toISOString(), cost: 'See listing',
          }))
        }
      }
    } catch {}

    // Strategy 2: Events page — JSON-LD, Tribe API, then HTML
    for (const url of [`${BASE}/events/`, `${BASE}/directory/`]) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()
        const jsonLd = extractJsonLd(html, SRC)
        if (jsonLd.length > 0) return jsonLd

        try {
          const api = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (api.ok) {
            const d = await api.json()
            if (d.events?.length > 0) return d.events.map((e: any) => ({
              source: SRC, source_id: `ficg-${e.id}`, source_url: e.url ?? url,
              title: stripHtml(e.title ?? ''),
              description: stripHtml(e.description ?? '').slice(0, 500),
              organizer: e.organizer?.[0]?.organizer ?? ORG,
              location_name: e.venue?.venue ?? e.venue?.city ?? 'See event',
              lat: parseFloat(e.venue?.geo_lat ?? '0'), lng: parseFloat(e.venue?.geo_lng ?? '0'),
              starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'See event',
            }))
          }
        } catch {}
        return scrape(html, url)
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, base: string): RawEvent[] {
  const ev: RawEvent[] = [], pat = /<(?:article|div)[^>]*class="[^"]*(?:event|community|directory|tribe|listing)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    ev.push({ source: SRC, source_id: `ficg-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], base).toString() : base, title,
      description: 'FIC community or event.', organizer: ORG,
      location_name: 'See listing', lat: 0, lng: 0, starts_at: new Date().toISOString(), cost: 'See event' })
  }
  return ev
}
