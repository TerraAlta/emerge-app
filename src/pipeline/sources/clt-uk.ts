/**
 * Community Land Trust Network UK — communitylandtrusts.org.uk
 * UK-focused CLT events: open days, workshops, community-led housing.
 * Different from clt-eu.ts which covers the European network.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://www.communitylandtrusts.org.uk/events/',
  'https://www.communitylandtrusts.org.uk/whats-on/',
]

export const cltUk: SourceFetcher = {
  name: 'clt-uk',
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
                  source: 'clt-uk', source_id: `cltuk-${e.id}`,
                  source_url: e.url ?? url,
                  title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: 'Community Land Trust Network UK',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'UK',
                  lat: parseFloat(e.venue?.geo_lat ?? '51.5074'), lng: parseFloat(e.venue?.geo_lng ?? '-0.1278'),
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'See event page',
                })
              }
              if (allEvents.length > 0) return allEvents
            }
          }
        } catch {}

        // Tier 2 — JSON-LD
        const jsonLd = extractJsonLd(html, 'clt-uk')
        if (jsonLd.length > 0) { allEvents.push(...jsonLd); continue }

        // Tier 3 — HTML scrape fallback
        const pattern = /<(?:article|div|li|section)[^>]*class="[^"]*(?:event|open-day|workshop|community|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
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
            source: 'clt-uk', source_id: `cltuk-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], host).toString() : url,
            title,
            description: descMatch ? stripHtml(descMatch[1]).trim().slice(0, 500) : 'CLT UK event — community land trust, open day, community-led housing.',
            organizer: 'Community Land Trust Network UK',
            location_name: 'UK', lat: 51.5074, lng: -0.1278,
            starts_at: startsAt, cost: 'See event page',
          })
        }
      } catch (err) {
        console.warn(`[clt-uk] ${url} failed:`, (err as Error).message)
      }
    }
    return allEvents
  },
}
