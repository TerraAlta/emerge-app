/**
 * Navdanya / Vandana Shiva — navdanya.org, vandanashiva.com
 * Seed sovereignty, food justice, Earth University courses.
 * 150+ seed banks across India. Global speaking events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://www.navdanya.org/earth-university',
  'https://www.navdanya.org/events',
  'https://www.navdanya.org/site/living-seed',
  'https://vandanashiva.com/events/',
  'https://vandanashiva.com/speaking-schedule/',
]

// Navdanya is in Dehradun, Uttarakhand, India
const NAVDANYA_LAT = 30.3165
const NAVDANYA_LNG = 78.0322

export const navdanyaGlobal: SourceFetcher = {
  name: 'navdanya-global',
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
        const jsonLd = extractJsonLd(html, 'navdanya-global')
        if (jsonLd.length > 0) { allEvents.push(...jsonLd); continue }

        // Tribe Events API
        const base = new URL(url).origin
        try {
          const apiRes = await fetch(`${base}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              for (const e of data.events) {
                allEvents.push({
                  source: 'navdanya-global',
                  source_id: `nav-${e.id}`,
                  source_url: e.url ?? url,
                  title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: e.organizer?.[0]?.organizer ?? 'Navdanya / Vandana Shiva',
                  location_name: e.venue?.venue ?? 'Navdanya Biodiversity Farm, Dehradun',
                  lat: parseFloat(e.venue?.geo_lat ?? '0') || NAVDANYA_LAT,
                  lng: parseFloat(e.venue?.geo_lng ?? '0') || NAVDANYA_LNG,
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'See event page',
                })
              }
              continue
            }
          }
        } catch {}

        // HTML scrape
        const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|course|programme|university|seed|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
        let match
        while ((match = pattern.exec(html)) !== null) {
          const block = match[1]
          const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5) continue
          if (/^(menu|nav|search|cookie)/i.test(title)) continue

          const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
          const dateMatch = block.match(/datetime="([^"]*)"/) || block.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4})/i)
          let startsAt = new Date().toISOString()
          if (dateMatch) { const d = new Date(dateMatch[1]); if (!isNaN(d.getTime())) startsAt = d.toISOString() }

          allEvents.push({
            source: 'navdanya-global',
            source_id: `nav-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url,
            title,
            description: descMatch ? stripHtml(descMatch[1]).trim().slice(0, 500) : 'Navdanya event — seed sovereignty, food justice, Earth University.',
            organizer: 'Navdanya / Vandana Shiva',
            location_name: 'See event page',
            lat: NAVDANYA_LAT, lng: NAVDANYA_LNG,
            starts_at: startsAt,
            cost: 'See event page',
          })
        }
      } catch (err) {
        console.warn(`[navdanya-global] ${url} failed:`, (err as Error).message)
      }
    }

    return allEvents
  },
}
