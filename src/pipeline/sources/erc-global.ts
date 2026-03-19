/**
 * Ecosystem Restoration Camps — GLOBAL feed
 * ecosystemrestorationcamps.org — volunteer camps worldwide
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://ecosystemrestorationcamps.org'
const URLS = [`${BASE}/camps/`, `${BASE}/volunteer/`, `${BASE}/events/`]

export const ercGlobal: SourceFetcher = {
  name: 'erc-global',
  async fetch() {
    // 1. Tribe Events API
    try {
      const r = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=30`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'erc-global', source_id: `ercg-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'Ecosystem Restoration Camps',
          location_name: e.venue?.venue ?? e.venue?.city ?? 'See event',
          lat: parseFloat(e.venue?.geo_lat ?? '0'), lng: parseFloat(e.venue?.geo_lng ?? '0'),
          starts_at: new Date(e.start_date).toISOString(),
          cost: e.cost ?? 'Volunteer (free)',
        }))
      }
    } catch {}

    // 2. WP REST API for camp posts
    try {
      const r = await fetch(`${BASE}/wp-json/wp/v2/posts?per_page=30`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const posts: any[] = await r.json()
        const camps = posts.filter(p => /camp|restor|volunteer/i.test(p.title?.rendered ?? ''))
        if (camps.length > 0) return camps.map(p => ({
          source: 'erc-global', source_id: `ercg-wp${p.id}`,
          source_url: p.link ?? null, title: stripHtml(p.title?.rendered ?? ''),
          description: stripHtml(p.excerpt?.rendered ?? '').slice(0, 500),
          organizer: 'Ecosystem Restoration Camps', location_name: 'See camp page',
          lat: 0, lng: 0, starts_at: new Date(p.date).toISOString(), cost: 'Volunteer (free)',
        }))
      }
    } catch {}

    // 3. HTML scrape
    for (const url of URLS) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) continue
        const html = await r.text()
        const ld = extractJsonLd(html, 'erc-global')
        if (ld.length > 0) return ld
        const ev = scrape(html, url)
        if (ev.length > 0) return ev
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, base: string): RawEvent[] {
  const out: RawEvent[] = []
  const rx = /<(?:article|div|li|section)[^>]*class="[^"]*(?:event|camp|project|volunteer|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
  let m
  while ((m = rx.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5 || /^(menu|nav|search|cookie)/i.test(title)) continue
    const desc = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    out.push({
      source: 'erc-global', source_id: `ercg-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], base).toString() : base, title,
      description: desc ? stripHtml(desc[1]).slice(0, 500) : 'Ecosystem restoration volunteer camp.',
      organizer: 'Ecosystem Restoration Camps', location_name: 'See camp page', lat: 0, lng: 0,
      starts_at: new Date().toISOString(), cost: 'Volunteer (free or low-cost)',
    })
  }
  return out
}
