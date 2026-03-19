/**
 * Climate Psychology Alliance — climatepsychology.org / climatepsychologyalliance.org
 * Climate anxiety support circles, webinars, and workshops.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://www.climatepsychologyalliance.org/events',
  'https://www.climatepsychology.org/events',
]
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' }

export const cpaGlobal: SourceFetcher = {
  name: 'cpa-global',
  async fetch() {
    const allEvents: RawEvent[] = []

    for (const url of URLS) {
      try {
        const origin = new URL(url).origin
        // 1. Try WP REST / Tribe Events API
        try {
          const api = await fetch(`${origin}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (api.ok) {
            const data = await api.json()
            for (const e of (data.events ?? [])) {
              if (!e.title || !e.start_date) continue
              allEvents.push({
                source: 'cpa-global', source_id: `cpa-${e.id ?? hashStr(e.title)}`,
                source_url: e.url ?? url, title: stripHtml(e.title),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: 'Climate Psychology Alliance',
                location_name: e.venue?.venue ?? e.venue?.city ?? 'Online',
                lat: parseFloat(e.venue?.geo_lat ?? '0'), lng: parseFloat(e.venue?.geo_lng ?? '0'),
                starts_at: new Date(e.start_date).toISOString(),
                ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
                cost: e.cost ?? 'See event page',
              })
            }
            if (allEvents.length > 0) return allEvents
          }
        } catch { /* fall through */ }

        // 2. HTML fetch → JSON-LD
        const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
        if (!res.ok) continue
        const html = await res.text()
        const jsonLd = extractJsonLd(html, 'cpa-global')
        if (jsonLd.length > 0) { allEvents.push(...jsonLd); continue }

        // 3. HTML scrape fallback
        const pat = /<(?:article|div|li|section)[^>]*class="[^"]*(?:event|workshop|circle|webinar|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
        let m
        while ((m = pat.exec(html)) !== null) {
          const block = m[1]
          const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5) continue
          if (/^(menu|nav|search|cookie|footer)/i.test(title)) continue
          const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
          const dateMatch = block.match(/datetime="([^"]*)"/) ||
            block.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4})/i)
          let startsAt = new Date().toISOString()
          if (dateMatch) { const d = new Date(dateMatch[1]); if (!isNaN(d.getTime())) startsAt = d.toISOString() }
          allEvents.push({
            source: 'cpa-global', source_id: `cpa-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], origin).toString() : url, title,
            description: descMatch ? stripHtml(descMatch[1]).trim().slice(0, 500) : 'Climate Psychology Alliance event.',
            organizer: 'Climate Psychology Alliance', location_name: 'Online',
            lat: 0, lng: 0, starts_at: startsAt, cost: 'See event page',
          })
        }
      } catch (err) {
        console.warn(`[cpa-global] ${url} failed:`, (err as Error).message)
      }
    }
    return allEvents
  },
}
