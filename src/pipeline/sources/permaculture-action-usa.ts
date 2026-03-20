/**
 * Permaculture Action Network — permacultureaction.org
 * Organizes permaculture action days at music festivals and communities.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://www.permacultureaction.org/events/',
  'https://www.permacultureaction.org/upcoming-events/',
]

export const permacultureActionUsa: SourceFetcher = {
  name: 'permaculture-action-usa',
  async fetch() {
    const allEvents: RawEvent[] = []

    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        // Tier 1 — WP REST / Tribe Events API
        const host = new URL(url).origin
        try {
          const apiRes = await fetch(`${host}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              for (const e of data.events) {
                allEvents.push({
                  source: 'permaculture-action-usa', source_id: `pan-${e.id}`,
                  source_url: e.url ?? url,
                  title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: 'Permaculture Action Network',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'Portland, OR',
                  lat: parseFloat(e.venue?.geo_lat ?? '45.5152'), lng: parseFloat(e.venue?.geo_lng ?? '-122.6784'),
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'See event page',
                })
              }
              if (allEvents.length > 0) return allEvents
            }
          }
        } catch {}

        // Tier 2 — JSON-LD
        const jsonLd = extractJsonLd(html, 'permaculture-action-usa')
        if (jsonLd.length > 0) { allEvents.push(...jsonLd); continue }

        // Tier 3 — HTML scrape fallback
        const pattern = /<(?:article|div|li|section)[^>]*class="[^"]*(?:event|action|workshop|convergence|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
        let match
        while ((match = pattern.exec(html)) !== null) {
          const block = match[1]
          const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5) continue
          if (/^(menu|nav|search|cookie|footer)/i.test(title)) continue

          const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
          const dateMatch = block.match(/datetime="([^"]*)"/) || block.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4})/i)
          let startsAt = new Date().toISOString()
          if (dateMatch) { const d = new Date(dateMatch[1]); if (!isNaN(d.getTime())) startsAt = d.toISOString() }

          allEvents.push({
            source: 'permaculture-action-usa', source_id: `pan-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], host).toString() : url,
            title,
            description: descMatch ? stripHtml(descMatch[1]).trim().slice(0, 500) : 'Permaculture action day — community building, ecological design.',
            organizer: 'Permaculture Action Network',
            location_name: 'Portland, OR', lat: 45.5152, lng: -122.6784,
            starts_at: startsAt, cost: 'See event page',
          })
        }
      } catch (err) {
        console.warn(`[permaculture-action-usa] ${url} failed:`, (err as Error).message)
      }
    }
    return allEvents
  },
}
