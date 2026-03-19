/**
 * Permaculture Research Institute — permaculturenews.org/events
 * Courses, workshops, design certificates across North America.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { geocodeNaCity } from './na-utils'

const BASE = 'https://www.permaculturenews.org'

export const priUsa: SourceFetcher = {
  name: 'pri-usa',
  async fetch() {
    const urls = [`${BASE}/events/`, `${BASE}/upcoming-events/`]

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'pri-usa')
        if (jsonLd.length > 0) return jsonLd

        // Tribe Events
        try {
          const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => {
                const geo = geocodeNaCity(e.venue?.city || '')
                return {
                  source: 'pri-usa', source_id: `pri-${e.id}`,
                  source_url: e.url ?? url,
                  title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: e.organizer?.[0]?.organizer ?? 'PRI',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'North America',
                  lat: parseFloat(e.venue?.geo_lat ?? '0') || geo?.lat || 0,
                  lng: parseFloat(e.venue?.geo_lng ?? '0') || geo?.lng || 0,
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'See event',
                }
              })
            }
          }
        } catch {}

        return scrape(html, url)
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|tribe|course|workshop)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pattern.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'pri-usa', source_id: `pri-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'PRI permaculture event.',
      organizer: 'Permaculture Research Institute',
      location_name: 'North America', lat: 0, lng: 0,
      starts_at: new Date().toISOString(), cost: 'See event',
    })
  }
  return events
}
