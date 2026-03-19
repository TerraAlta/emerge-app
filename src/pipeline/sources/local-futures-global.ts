/**
 * Local Futures / Helena Norberg-Hodge — localfutures.org
 * Economics of Happiness, World Localisation Day, localisation movement.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://www.localfutures.org/events/',
  'https://www.localfutures.org/world-localization-day/',
  'https://www.localfutures.org/programs/',
  'https://www.localfutures.org/economics-of-happiness/',
]

export const localFuturesGlobal: SourceFetcher = {
  name: 'local-futures-global',
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

        // JSON-LD
        const jsonLd = extractJsonLd(html, 'local-futures-global')
        if (jsonLd.length > 0) { allEvents.push(...jsonLd); continue }

        // Tribe Events API
        try {
          const apiRes = await fetch('https://www.localfutures.org/wp-json/tribe/events/v1/events?per_page=20', {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              for (const e of data.events) {
                allEvents.push({
                  source: 'local-futures-global',
                  source_id: `lf-${e.id}`,
                  source_url: e.url ?? url,
                  title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: 'Local Futures / Helena Norberg-Hodge',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'Global',
                  lat: parseFloat(e.venue?.geo_lat ?? '0'),
                  lng: parseFloat(e.venue?.geo_lng ?? '0'),
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'See event page',
                })
              }
              if (allEvents.length > 0) return allEvents
            }
          }
        } catch {}

        // HTML scrape
        const pattern = /<(?:article|div|li|section)[^>]*class="[^"]*(?:event|program|screening|localisation|tribe|post)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
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
            source: 'local-futures-global',
            source_id: `lf-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], 'https://www.localfutures.org').toString() : url,
            title,
            description: descMatch ? stripHtml(descMatch[1]).trim().slice(0, 500) : 'Local Futures event — economics of happiness, localisation, community resilience.',
            organizer: 'Local Futures / Helena Norberg-Hodge',
            location_name: 'Global',
            lat: 0, lng: 0,
            starts_at: startsAt,
            cost: 'See event page',
          })
        }
      } catch (err) {
        console.warn(`[local-futures-global] ${url} failed:`, (err as Error).message)
      }
    }

    return allEvents
  },
}
