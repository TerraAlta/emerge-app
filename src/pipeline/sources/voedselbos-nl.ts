/**
 * Voedselbosbouw Nederland — food forest network
 * 200+ food forests across the Netherlands.
 * voedselbos.nl or voedselbosbouw.nl
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractDutchDate, geocodeDutchCity } from './dutch-utils'

const URLS = [
  'https://www.voedselbos.nl/agenda/',
  'https://www.voedselbos.nl/events/',
  'https://www.voedselbosbouw.nl/agenda/',
  'https://www.voedselbosbouw.nl/events/',
  'https://www.greendealvoedselbossen.nl/agenda/',
]

export const voedselbosNl: SourceFetcher = {
  name: 'voedselbos-nl',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'voedselbos-nl')
        if (jsonLd.length > 0) return jsonLd

        // Try WP REST events
        const base = new URL(url).origin
        try {
          const apiRes = await fetch(`${base}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => {
                const geo = geocodeDutchCity(e.venue?.city || '')
                return {
                  source: 'voedselbos-nl',
                  source_id: `vb-${e.id}`,
                  source_url: e.url ?? url,
                  title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: e.organizer?.[0]?.organizer ?? 'Voedselbosbouw Nederland',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'Nederland',
                  lat: parseFloat(e.venue?.geo_lat ?? '0') || geo?.lat || 0,
                  lng: parseFloat(e.venue?.geo_lng ?? '0') || geo?.lng || 0,
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'Zie evenement',
                }
              })
            }
          }
        } catch {}

        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|agenda|voedselbos|tribe|workshop)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    const geo = geocodeDutchCity(block)
    events.push({
      source: 'voedselbos-nl',
      source_id: `vb-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title,
      description: 'Voedselbos evenement — food forest volunteer day, workshop, or harvest.',
      organizer: 'Voedselbosbouw Nederland',
      location_name: 'Nederland',
      lat: geo?.lat || 0, lng: geo?.lng || 0,
      starts_at: extractDutchDate(block),
      cost: 'Zie evenement',
    })
  }
  return events
}
