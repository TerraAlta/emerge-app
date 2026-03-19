/**
 * Rete Italiana Permacultura — permacultura.it, accademiaitaliandipermacultura.it
 * Italian permaculture network events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractItalianDate, geocodeItalianCity } from './south-eu-utils'

const URLS = [
  'https://www.permacultura.it/eventi/',
  'https://www.accademiaitaliandipermacultura.it/eventi/',
]

export const permaculturaIt: SourceFetcher = {
  name: 'permacultura-it',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'permacultura-it')
        if (jsonLd.length > 0) return jsonLd

        const base = new URL(url).origin
        try {
          const apiRes = await fetch(`${base}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => {
                const geo = geocodeItalianCity(e.venue?.city || '')
                return {
                  source: 'permacultura-it', source_id: `perm-it-${e.id}`,
                  source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: e.organizer?.[0]?.organizer ?? 'Rete Italiana Permacultura',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'Italia',
                  lat: parseFloat(e.venue?.geo_lat ?? '0') || geo?.lat || 0,
                  lng: parseFloat(e.venue?.geo_lng ?? '0') || geo?.lng || 0,
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'Vedi evento',
                } satisfies RawEvent
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
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|evento|corso|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    const locMatch = block.match(/(?:class="[^"]*(?:location|luogo|sede)[^"]*"[^>]*>)([\s\S]*?)<\//i)
    const location = locMatch ? stripHtml(locMatch[1]).trim() : 'Italia'
    const geo = geocodeItalianCity(location + ' ' + block)

    events.push({
      source: 'permacultura-it', source_id: `perm-it-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title, description: 'Evento di permacultura. Vedi link per dettagli.',
      organizer: 'Rete Italiana Permacultura', location_name: location,
      lat: geo?.lat || 0, lng: geo?.lng || 0,
      starts_at: extractItalianDate(block), cost: 'Vedi evento',
    })
  }
  return events
}
