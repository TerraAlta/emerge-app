/**
 * Alternatiba — alternatiba.eu + fetedespossibles.fr
 * Climate justice movement — village of alternatives events across France.
 * Fête des Possibles is run by Alternatiba, included as secondary URL.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractFrenchDate, geocodeFrBe } from './french-utils'

const URLS = [
  'https://alternatiba.eu/agenda/',
  'https://alternatiba.eu/evenements/',
  'https://fetedespossibles.fr/agenda/',
]
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' }

export const alternatibaFr: SourceFetcher = {
  name: 'alternatiba-fr',
  async fetch() {
    for (const base of URLS) {
      try {
        const origin = new URL(base).origin
        // 1. Try Tribe Events Calendar WP API
        try {
          const api = await fetch(`${origin}/wp-json/tribe/events/v1/events`, {
            headers: HEADERS, signal: AbortSignal.timeout(10000),
          })
          if (api.ok) {
            const data = await api.json()
            const evts = (data.events ?? []) as any[]
            return evts.filter((e: any) => e.title && e.start_date).map((e: any): RawEvent => {
              const geo = geocodeFrBe(e.venue?.city ?? e.venue?.address ?? '') ?? { lat: 48.8566, lng: 2.3522 }
              return {
                source: 'alternatiba-fr', source_id: `alternatiba-${hashStr(e.title + e.start_date)}`,
                source_url: e.url ?? base, title: stripHtml(e.title),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: 'Alternatiba', location_name: e.venue?.venue ?? 'France',
                ...geo, starts_at: new Date(e.start_date).toISOString(),
                ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
                cost: e.cost ?? 'See event page',
              }
            })
          }
        } catch { /* fall through */ }

        // 2. HTML fetch -> JSON-LD -> scrape
        const res = await fetch(base, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
        if (!res.ok) continue
        const html = await res.text()
        const jsonLd = extractJsonLd(html, 'alternatiba-fr')
        if (jsonLd.length > 0) return jsonLd
        return scrapeHtml(html, base)
      } catch { continue }
    }
    console.warn('[alternatiba-fr] all URLs failed')
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|agenda|village|action|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
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
    const locName = loc ? stripHtml(loc[1]).trim() : 'France'
    const geo = geocodeFrBe(locName) ?? { lat: 48.8566, lng: 2.3522 }
    events.push({
      source: 'alternatiba-fr', source_id: `alternatiba-${hashStr(title)}`,
      source_url: link, title, description: `Alternatiba climate alternatives event. See ${link}`,
      organizer: 'Alternatiba', location_name: locName, ...geo,
      starts_at: startsAt, cost: 'See event page',
    })
  }
  return events
}
