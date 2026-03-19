/**
 * Stop Ecocide International — stopecocide.earth
 * Ecocide law campaign, assemblies, workshops, direct action events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://www.stopecocide.earth/events',
  'https://www.stopecocide.earth/take-action',
]

export const stopEcocide: SourceFetcher = {
  name: 'stop-ecocide',
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
        const jsonLd = extractJsonLd(html, 'stop-ecocide')
        if (jsonLd.length > 0) { allEvents.push(...jsonLd); continue }

        // WP REST / Tribe Events API
        try {
          const apiRes = await fetch('https://www.stopecocide.earth/wp-json/tribe/events/v1/events?per_page=20', {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              for (const e of data.events) {
                allEvents.push({
                  source: 'stop-ecocide', source_id: `sei-${e.id}`,
                  source_url: e.url ?? url,
                  title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: 'Stop Ecocide International',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'Global',
                  lat: parseFloat(e.venue?.geo_lat ?? '0'), lng: parseFloat(e.venue?.geo_lng ?? '0'),
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'Free',
                })
              }
              if (allEvents.length > 0) return allEvents
            }
          }
        } catch {}

        // HTML scrape fallback
        const pattern = /<(?:article|div|li|section)[^>]*class="[^"]*(?:event|action|assembly|workshop|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
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
            source: 'stop-ecocide', source_id: `sei-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], 'https://www.stopecocide.earth').toString() : url,
            title,
            description: descMatch ? stripHtml(descMatch[1]).trim().slice(0, 500) : 'Stop Ecocide event \u2014 ecocide law, earth rights, environmental justice.',
            organizer: 'Stop Ecocide International',
            location_name: 'Global', lat: 0, lng: 0,
            starts_at: startsAt, cost: 'Free',
          })
        }
      } catch (err) {
        console.warn(`[stop-ecocide] ${url} failed:`, (err as Error).message)
      }
    }
    return allEvents
  },
}
