/**
 * European Permaculture Network — permaculture-network.eu/courses-events
 * Drupal site with event listings. Scrapes HTML for event data.
 */
import type { RawEvent, SourceFetcher } from './types'
import { haversine, stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://permaculture-network.eu/courses-events/',
  'https://permaculture-network.eu/events/',
]

export const eupn: SourceFetcher = {
  name: 'eupn',
  async fetch({ lat, lng, radiusKm }) {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
        })
        if (!res.ok) continue
        const html = await res.text()

        // Try JSON-LD first
        const jsonLd = extractJsonLd(html, 'eupn')
        if (jsonLd.length > 0) return jsonLd

        // Scrape HTML — look for event cards/rows
        return scrapeHtml(html, url)
      } catch (err) {
        console.warn(`[eupn] ${url} failed:`, (err as Error).message)
      }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []

  // Common patterns: <article>, <div class="event">, <h2><a href="...">Title</a></h2>
  const blockPattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|course|listing|node)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = blockPattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[23][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[23]>/i)
    if (!titleMatch) continue

    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    const link = titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl

    // Extract date
    const dateMatch = block.match(/(?:datetime="([^"]*)")|(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i)
    let startsAt = new Date().toISOString()
    if (dateMatch) {
      const parsed = new Date(dateMatch[1] || dateMatch[2])
      if (!isNaN(parsed.getTime())) startsAt = parsed.toISOString()
    }

    // Extract location
    const locMatch = block.match(/(?:class="[^"]*location[^"]*"[^>]*>)([\s\S]*?)<\//i)
    const location = locMatch ? stripHtml(locMatch[1]).trim() : ''

    // Extract description
    const descMatch = block.match(/(?:class="[^"]*(?:summary|excerpt|body|desc)[^"]*"[^>]*>)([\s\S]*?)<\//i)
    const description = descMatch ? stripHtml(descMatch[1]).trim() : ''

    events.push({
      source: 'eupn',
      source_id: `eupn-${hashStr(title + startsAt)}`,
      source_url: link,
      title,
      description: description || 'European permaculture event. See link for details.',
      organizer: 'European Permaculture Network',
      location_name: location || 'Europe',
      lat: 0, lng: 0,
      starts_at: startsAt,
      cost: 'See event page',
    })
  }

  return events
}
