/** Agenda Cultural Lisboa + Porto.lazer — Portuguese cultural event aggregators */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

interface AgendaSource {
  name: string
  urls: string[]
  org: string
  city: string
  lat: number
  lng: number
}

const SOURCES: AgendaSource[] = [
  {
    name: 'agenda-cultural-lisboa',
    urls: ['https://www.agendaculturallisboa.pt/eventos/', 'https://agendaculturallisboa.pt/eventos/'],
    org: 'Agenda Cultural Lisboa', city: 'Lisboa', lat: 38.7169, lng: -9.1395,
  },
  {
    name: 'porto-lazer',
    urls: ['https://www.porto.pt/lazer/agenda', 'https://porto.pt/pt/lazer/agenda'],
    org: 'Porto.lazer', city: 'Porto', lat: 41.1579, lng: -8.6291,
  },
]

/** Keywords that indicate Play or Make — filter results to these */
const PLAY_MAKE_RX = /fado|folk|trad|percuss|drum|música|rancho|jam|open mic|oficina|viola|cante|session|choir|coro|estúdio|mural|arte|ecológic|natureza|exposição|atelier|colaborativ|impressão|zine|print|climát|residência|alternativ|workshop|comunitar/i

async function scrapeAgenda(src: AgendaSource): Promise<RawEvent[]> {
  for (const url of src.urls) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) continue
      const html = await r.text()

      const ld = extractJsonLd(html, src.name)
      if (ld.length > 0) return ld.filter(e => PLAY_MAKE_RX.test(e.title + ' ' + e.description))

      const out: RawEvent[] = []
      const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|evento|agenda|item|post)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
      let m
      while ((m = rx.exec(html)) !== null) {
        const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
        if (!t) continue
        const title = stripHtml(t[2]).trim()
        if (!title || title.length < 5) continue
        if (!PLAY_MAKE_RX.test(title + ' ' + stripHtml(m[1]))) continue

        const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+(?:de\s+)?\w+\s+(?:de\s+)?\d{4})/i)
        let starts = new Date().toISOString()
        if (dm) { const p = new Date(dm[1] || dm[2]); if (!isNaN(p.getTime())) starts = p.toISOString() }

        out.push({
          source: src.name, source_id: `${src.name}-${hashStr(title + starts)}`,
          source_url: t[1] ? new URL(t[1], url).toString() : url, title,
          description: `${src.org} — community music or art event in ${src.city}.`,
          organizer: src.org, location_name: src.city,
          lat: src.lat, lng: src.lng, starts_at: starts, cost: 'See event page',
        })
      }
      if (out.length > 0) return out
    } catch { continue }
  }
  return []
}

export const agendaCulturalPt: SourceFetcher = {
  name: 'agenda-cultural-pt',
  async fetch() {
    const results: RawEvent[] = []
    for (const src of SOURCES) {
      const events = await scrapeAgenda(src)
      results.push(...events)
      await new Promise(r => setTimeout(r, 1500))
    }
    return results
  },
}
