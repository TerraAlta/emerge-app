/**
 * Rewilding Britain — rewildingbritain.org.uk
 * Volunteer programmes and restoration events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://www.rewildingbritain.org.uk'
const URLS = [
  `${BASE}/get-involved/volunteer/`,
  `${BASE}/events/`,
  `${BASE}/get-involved/`,
]

export const rewildingUk: SourceFetcher = {
  name: 'rewilding-uk',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        // JSON-LD
        const jsonLd = extractJsonLd(html, 'rewilding-uk')
        if (jsonLd.length > 0) return jsonLd

        // The Events Calendar API
        const apiBase = BASE
        try {
          const apiRes = await fetch(`${apiBase}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { 'User-Agent': 'Emerge-App/1.0', Accept: 'application/json' },
            signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: 'rewilding-uk',
                source_id: `rw-${e.id}`,
                source_url: e.url ?? url,
                title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: 'Rewilding Britain',
                location_name: e.venue?.venue ?? 'UK',
                lat: parseFloat(e.venue?.geo_lat ?? '0'),
                lng: parseFloat(e.venue?.geo_lng ?? '0'),
                starts_at: new Date(e.start_date).toISOString(),
                cost: 'Free (volunteer)',
              }))
            }
          }
        } catch {}

        // HTML scrape
        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch (err) {
        console.warn(`[rewilding-uk] ${url} failed:`, (err as Error).message)
      }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []

  // Look for event/volunteer cards
  const pattern = /<(?:article|div|section)[^>]*class="[^"]*(?:event|volunteer|card|opportunity|programme)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|section)>/gi
  let match

  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue

    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue
    // Skip generic nav items
    if (/^(menu|nav|search|skip|cookie|privacy)/i.test(title)) continue

    const link = titleMatch[1] ? new URL(titleMatch[1], BASE).toString() : baseUrl

    const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    const description = descMatch ? stripHtml(descMatch[1]).trim().slice(0, 500) : ''

    events.push({
      source: 'rewilding-uk',
      source_id: `rw-${hashStr(title)}`,
      source_url: link,
      title,
      description: description || 'Rewilding Britain volunteer programme. Help restore wild landscapes across the UK.',
      organizer: 'Rewilding Britain',
      location_name: 'UK',
      lat: 0, lng: 0,
      starts_at: new Date().toISOString(),
      cost: 'Free (volunteer)',
    })
  }

  return events
}
