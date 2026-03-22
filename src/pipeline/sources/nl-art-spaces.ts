/** Dutch community music & art spaces — OCCII Amsterdam, WORM Rotterdam */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

interface ArtSpace {
  name: string
  urls: string[]
  org: string
  city: string
  lat: number
  lng: number
}

const SPACES: ArtSpace[] = [
  {
    name: 'occii',
    urls: ['https://occii.org/agenda/', 'https://www.occii.org/agenda/', 'https://occii.org/events/'],
    org: 'OCCII', city: 'Amsterdam', lat: 52.3540, lng: 4.8614,
  },
  {
    name: 'worm-rotterdam',
    urls: ['https://worm.org/agenda/', 'https://www.worm.org/agenda/', 'https://worm.org/events/'],
    org: 'WORM', city: 'Rotterdam', lat: 51.9189, lng: 4.4865,
  },
]

const INCLUDE_RX = /workshop|atelier|open|community|gemeenschap|participat|walk|wandeling|studio|making|print|druk|zeefdruk|zine|ecolog|klimaat|residenti|music|muziek|folk|jam|session|sessie|percuss|drum|trommel|sing|zang|koor|art|kunst|bal folk/i
const EXCLUDE_RX = /club night|dj set|techno|house music|rave|corporate|sponsor|VIP|€[3-9]\d|€\d{3}/i

async function scrapeSpace(space: ArtSpace): Promise<RawEvent[]> {
  for (const url of space.urls) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(12000),
      })
      if (!r.ok) continue
      const html = await r.text()

      const ld = extractJsonLd(html, space.name)
      if (ld.length > 0) {
        return ld.filter(e => {
          const text = e.title + ' ' + e.description
          return INCLUDE_RX.test(text) && !EXCLUDE_RX.test(text)
        })
      }

      const out: RawEvent[] = []
      const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|agenda|programm|post|item)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
      let m
      while ((m = rx.exec(html)) !== null) {
        const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
        if (!t) continue
        const title = stripHtml(t[2]).trim()
        if (!title || title.length < 5) continue
        const text = title + ' ' + stripHtml(m[1])
        if (!INCLUDE_RX.test(text) || EXCLUDE_RX.test(text)) continue

        const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+\w+\s+\d{4})/i)
        let starts = new Date().toISOString()
        if (dm) { const p = new Date(dm[1] || dm[2]); if (!isNaN(p.getTime())) starts = p.toISOString() }

        out.push({
          source: space.name, source_id: `${space.name}-${hashStr(title + starts)}`,
          source_url: t[1] ? new URL(t[1], url).toString() : url, title,
          description: `${space.org} — community art or music event in ${space.city}.`,
          organizer: space.org, location_name: `${space.org}, ${space.city}`,
          lat: space.lat, lng: space.lng, starts_at: starts, cost: 'See event page',
        })
      }
      if (out.length > 0) return out
    } catch { continue }
  }
  return []
}

export const nlArtSpaces: SourceFetcher = {
  name: 'nl-art-spaces',
  async fetch() {
    const results: RawEvent[] = []
    for (const space of SPACES) {
      const events = await scrapeSpace(space)
      results.push(...events)
      await new Promise(r => setTimeout(r, 1500))
    }
    return results
  },
}
