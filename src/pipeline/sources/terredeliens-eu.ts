/**
 * Terre de Liens (EU network) — terredeliens.org
 * EU-wide farmland access, agroecology events and gatherings.
 * Separate from terredeliens-fr.ts which covers France-specific events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractFrenchDate, geocodeFrBe } from './french-utils'

const URLS = [
  'https://terredeliens.org/agenda/',
  'https://terredeliens.org/evenements/',
]
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' }

export const terredeliensEu: SourceFetcher = {
  name: 'terredeliens-eu',
  async fetch() {
    for (const base of URLS) {
      try {
        const origin = new URL(base).origin
        // 1. Try WP REST / Tribe Events API
        try {
          const api = await fetch(`${origin}/wp-json/tribe/events/v1/events?per_page=50`, {
            headers: HEADERS, signal: AbortSignal.timeout(10000),
          })
          if (api.ok) {
            const data = await api.json()
            const evts = (data.events ?? []) as any[]
            return evts.filter((e: any) => e.title && e.start_date).map((e: any): RawEvent => {
              const geo = geocodeFrBe(e.venue?.city ?? e.venue?.address ?? '') ?? { lat: 0, lng: 0 }
              return {
                source: 'terredeliens-eu', source_id: `tdle-${hashStr(e.title + e.start_date)}`,
                source_url: e.url ?? base, title: stripHtml(e.title),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: 'Terre de Liens',
                location_name: e.venue?.venue ?? 'Europe', ...geo,
                starts_at: new Date(e.start_date).toISOString(),
                ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
                cost: e.cost ?? 'See event page',
              }
            })
          }
        } catch { /* fall through */ }

        // 2. HTML fetch → JSON-LD
        const res = await fetch(base, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
        if (!res.ok) continue
        const html = await res.text()
        const jsonLd = extractJsonLd(html, 'terredeliens-eu')
        if (jsonLd.length > 0) return jsonLd

        // 3. HTML scrape fallback with French date parsing
        return scrapeHtml(html, base)
      } catch { continue }
    }
    console.warn('[terredeliens-eu] all URLs failed')
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|agenda|ferme|action|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const link = t[1] ? new URL(t[1], baseUrl).toString() : baseUrl
    const startsAt = extractFrenchDate(block)
    const loc = block.match(/(?:class="[^"]*(?:lieu|location|city)[^"]*"[^>]*>)([\s\S]*?)<\//i)
    const locName = loc ? stripHtml(loc[1]).trim() : 'Europe'
    const geo = geocodeFrBe(locName) ?? { lat: 0, lng: 0 }
    events.push({
      source: 'terredeliens-eu', source_id: `tdle-${hashStr(title)}`,
      source_url: link, title, description: `Terre de Liens EU event. See ${link}`,
      organizer: 'Terre de Liens', location_name: locName, ...geo,
      starts_at: startsAt, cost: 'See event page',
    })
  }
  return events
}
