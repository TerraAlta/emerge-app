/**
 * Cohousing Italia — cohousing.it events
 * Italian cohousing community events and open days.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://www.cohousing.it/eventi/',
  'https://www.cohousing.it/news-eventi/',
]
const DEFAULT_LAT = 45.4642
const DEFAULT_LNG = 9.1900

function parseIT(s: string): string {
  const m: Record<string,string> = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'}
  const c = s.toLowerCase().trim()
  for (const [k,v] of Object.entries(m)) { if (c.includes(k)) { const d = c.match(/(\d{1,2})\s/); const y = c.match(/(\d{4})/); if(d&&y) return new Date(`${y[1]}-${v}-${d[1].padStart(2,'0')}`).toISOString() } }
  const p = new Date(s); return isNaN(p.getTime()) ? new Date().toISOString() : p.toISOString()
}

export const cohousingIt: SourceFetcher = {
  name: 'cohousing-it',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'cohousing-it')
        if (jsonLd.length > 0) return jsonLd

        const base = new URL(url).origin
        try {
          const apiRes = await fetch(`${base}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: 'cohousing-it', source_id: `coh-${e.id}`,
                source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? 'Cohousing Italia',
                location_name: e.venue?.venue ?? e.venue?.city ?? 'Italia',
                lat: parseFloat(e.venue?.geo_lat ?? '0') || DEFAULT_LAT,
                lng: parseFloat(e.venue?.geo_lng ?? '0') || DEFAULT_LNG,
                starts_at: new Date(e.start_date).toISOString(),
                ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
                cost: e.cost ?? 'Vedi evento',
              } satisfies RawEvent))
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
  const pattern = /<(?:article|div|li)[^>]*class="[^"]*(?:event|evento|open-day|incontro|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!titleMatch) continue
    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'cohousing-it', source_id: `coh-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], baseUrl).toString() : baseUrl,
      title, description: 'Evento Cohousing Italia. Vedi link per dettagli.',
      organizer: 'Cohousing Italia',
      location_name: 'Italia', lat: DEFAULT_LAT, lng: DEFAULT_LNG,
      starts_at: parseIT(block), cost: 'Vedi evento',
    })
  }
  return events
}
