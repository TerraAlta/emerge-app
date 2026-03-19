/**
 * Permablitz UK — permablitz.net
 * Community garden transformation events.
 * Small org, likely a simple WordPress or static site.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://www.permablitz.net/events/',
  'https://www.permablitz.net/upcoming-blitzes/',
  'https://permablitz.net/',
  'https://www.permablitz.co.uk/',
  'https://www.permablitzlondon.com/events/',
  'https://www.permablitzlondon.com/',
]

export const permablitzUk: SourceFetcher = {
  name: 'permablitz-uk',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) continue
        const html = await res.text()

        // JSON-LD
        const jsonLd = extractJsonLd(html, 'permablitz-uk')
        if (jsonLd.length > 0) return jsonLd

        // The Events Calendar API
        const tribeBase = url.replace(/\/events\/?$/, '').replace(/\/$/, '')
        try {
          const apiRes = await fetch(`${tribeBase}/wp-json/tribe/events/v1/events?per_page=10`, {
            headers: { 'User-Agent': 'Emerge-App/1.0', Accept: 'application/json' },
            signal: AbortSignal.timeout(5000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: 'permablitz-uk',
                source_id: `pb-${e.id}`,
                source_url: e.url ?? url,
                title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? 'Permablitz',
                location_name: e.venue?.venue ?? 'UK',
                lat: parseFloat(e.venue?.geo_lat ?? '0'),
                lng: parseFloat(e.venue?.geo_lng ?? '0'),
                starts_at: new Date(e.start_date).toISOString(),
                cost: 'Free (community event)',
              }))
            }
          }
        } catch { /* continue to HTML scrape */ }

        // HTML scrape
        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }

    console.warn('[permablitz-uk] all URLs failed')
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|blitz|tribe|post)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match

  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue

    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    const dateMatch = block.match(/datetime="([^"]*)"/) || block.match(/(\d{1,2}\s+\w+\s+\d{4})/)
    let startsAt = new Date().toISOString()
    if (dateMatch) {
      const parsed = new Date(dateMatch[1])
      if (!isNaN(parsed.getTime())) startsAt = parsed.toISOString()
    }

    events.push({
      source: 'permablitz-uk',
      source_id: `pb-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title: `Permablitz — ${title}`,
      description: 'Community garden transformation day. Free food, good company, and a garden transformed in one day.',
      organizer: 'Permablitz',
      location_name: 'UK',
      lat: 0, lng: 0,
      starts_at: startsAt,
      cost: 'Free',
    })
  }

  return events
}
