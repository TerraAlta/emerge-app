/**
 * Transition US — transitionus.org
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { geocodeNaCity } from './na-utils'

const BASE = 'https://www.transitionus.org'

export const transitionUs: SourceFetcher = {
  name: 'transition-us',
  async fetch() {
    const urls = [`${BASE}/initiatives/`, `${BASE}/events/`, `${BASE}/whats-happening/`]
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'transition-us')
        if (jsonLd.length > 0) return jsonLd

        try {
          const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: 'transition-us', source_id: `tus-${e.id}`,
                source_url: e.url ?? url,
                title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? 'Transition US',
                location_name: e.venue?.city ?? 'USA',
                lat: parseFloat(e.venue?.geo_lat ?? '0'),
                lng: parseFloat(e.venue?.geo_lng ?? '0'),
                starts_at: new Date(e.start_date).toISOString(),
                cost: e.cost ?? 'See event',
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
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|initiative|tribe|group)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pattern.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const geo = geocodeNaCity(m[1])
    events.push({
      source: 'transition-us', source_id: `tus-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'Transition US initiative.',
      organizer: 'Transition US', location_name: 'USA',
      lat: geo?.lat || 0, lng: geo?.lng || 0,
      starts_at: new Date().toISOString(), cost: 'See event',
    })
  }
  return events
}
