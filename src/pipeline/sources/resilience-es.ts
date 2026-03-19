/**
 * Resilience.Earth — resilience.earth/eventos
 * Resilience network events (Spain / Catalonia).
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractSpanishDate, geocodeSpanishCity } from './south-eu-utils'

const URLS = [
  'https://resilience.earth/eventos/',
  'https://resilience.earth/events/',
]
const SRC = 'resilience-es'
const ORG = 'Resilience.Earth'

export const resilienceEs: SourceFetcher = {
  name: SRC,
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, SRC)
        if (jsonLd.length > 0) return jsonLd

        try {
          const origin = new URL(url).origin
          const apiRes = await fetch(`${origin}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: SRC, source_id: `res-es-${e.id}`, source_url: e.url ?? url,
                title: stripHtml(e.title ?? ''), description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? ORG,
                location_name: e.venue?.venue ?? e.venue?.city ?? 'España',
                lat: parseFloat(e.venue?.geo_lat ?? '0'), lng: parseFloat(e.venue?.geo_lng ?? '0'),
                starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'Ver evento',
              }))
            }
          }
        } catch {}

        return scrapeHtml(html, url)
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|taller|activitat|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const geo = geocodeSpanishCity(block)
    events.push({
      source: SRC, source_id: `res-es-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl, title,
      description: 'Evento de resiliencia. Ver enlace para detalles.', organizer: ORG,
      location_name: 'España', lat: geo?.lat ?? 0, lng: geo?.lng ?? 0,
      starts_at: extractSpanishDate(block), cost: 'Ver evento',
    })
  }
  return events
}
