/**
 * Ecosystem Restoration Camps — ecosystemrestorationcamps.org
 * Global network of volunteer restoration camps.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://ecosystemrestorationcamps.org'

export const ercNa: SourceFetcher = {
  name: 'erc-na',
  async fetch() {
    const urls = [
      `${BASE}/camps/`,
      `${BASE}/volunteer/`,
      `${BASE}/events/`,
    ]

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'erc-na')
        if (jsonLd.length > 0) return jsonLd

        // Try WP Events Calendar
        try {
          const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: 'erc-na', source_id: `erc-${e.id}`,
                source_url: e.url ?? url,
                title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: 'Ecosystem Restoration Camps',
                location_name: e.venue?.venue ?? e.venue?.city ?? 'See event',
                lat: parseFloat(e.venue?.geo_lat ?? '0'),
                lng: parseFloat(e.venue?.geo_lng ?? '0'),
                starts_at: new Date(e.start_date).toISOString(),
                cost: e.cost ?? 'Volunteer (free)',
              }))
            }
          }
        } catch {}

        const events = scrape(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li|section)[^>]*class="[^"]*(?:camp|event|project|volunteer|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
  let m
  while ((m = pattern.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    if (/^(menu|nav|search|cookie)/i.test(title)) continue

    const descMatch = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i)

    events.push({
      source: 'erc-na', source_id: `erc-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title,
      description: descMatch ? stripHtml(descMatch[1]).trim().slice(0, 500) : 'Ecosystem restoration volunteer camp.',
      organizer: 'Ecosystem Restoration Camps',
      location_name: 'See camp page', lat: 0, lng: 0,
      starts_at: new Date().toISOString(),
      cost: 'Volunteer (free or low-cost)',
    })
  }
  return events
}
