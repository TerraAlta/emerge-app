/**
 * Centre for Alternative Technology — cat.org.uk
 * Europe's leading eco-centre, 60 years of sustainable living education.
 * Courses, workshops, open days, and visitor events in Machynlleth, Wales.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://cat.org.uk/events/',
  'https://cat.org.uk/events-courses/',
]

export const catUk: SourceFetcher = {
  name: 'cat-uk',
  async fetch(opts: { lat: number; lng: number; radiusKm: number }) {
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
                  source: 'cat-uk', source_id: `cat-${e.id}`,
                  source_url: e.url ?? url,
                  title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: 'Centre for Alternative Technology',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'Machynlleth, Wales',
                  lat: parseFloat(e.venue?.geo_lat ?? '52.5900'), lng: parseFloat(e.venue?.geo_lng ?? '-3.8500'),
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'See event page',
                })
              }
              if (allEvents.length > 0) return allEvents
            }
          }
        } catch {}

        // Tier 2 — JSON-LD
        const jsonLd = extractJsonLd(html, 'cat-uk')
        if (jsonLd.length > 0) { allEvents.push(...jsonLd); continue }

        // Tier 3 — HTML scrape fallback
        const pattern = /<(?:article|div|li|section)[^>]*class="[^"]*(?:event|course|workshop|visit|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
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
            source: 'cat-uk', source_id: `cat-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], host).toString() : url,
            title,
            description: descMatch ? stripHtml(descMatch[1]).trim().slice(0, 500) : 'CAT event — sustainable living, eco-building, renewable energy.',
            organizer: 'Centre for Alternative Technology',
            location_name: 'Machynlleth, Wales', lat: 52.5900, lng: -3.8500,
            starts_at: startsAt, cost: 'See event page',
          })
        }
      } catch (err) {
        console.warn(`[cat-uk] ${url} failed:`, (err as Error).message)
      }
    }
    return allEvents
  },
}
