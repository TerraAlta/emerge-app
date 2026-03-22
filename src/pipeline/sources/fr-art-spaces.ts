/** French community art & music spaces — Collectif MU, Le 6b, Le Bal Blomet */
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
    name: 'collectif-mu',
    urls: ['https://collectifmu.fr/agenda/', 'https://www.collectifmu.fr/agenda/', 'https://collectifmu.fr/events/'],
    org: 'Collectif MU', city: 'Paris', lat: 48.8924, lng: 2.3849,
  },
  {
    name: 'le-6b',
    urls: ['https://le6b.fr/evenements/', 'https://www.le6b.fr/evenements/', 'https://le6b.fr/events/'],
    org: 'Le 6b', city: 'Saint-Denis', lat: 48.9362, lng: 2.3574,
  },
  {
    name: 'bal-blomet',
    urls: ['https://balblomet.fr/programmation/', 'https://www.balblomet.fr/programmation/', 'https://balblomet.fr/events/'],
    org: 'Le Bal Blomet', city: 'Paris', lat: 48.8421, lng: 2.3057,
  },
]

const INCLUDE_RX = /workshop|atelier|open|ouvert|community|communaut|participat|walk|balade|studio|making|print|sérigraph|zine|ecolog|écolog|climat|résidence|music|musique|folk|jam|session|percuss|drum|sing|chant|chor|chorale|fest-noz|bal folk|art|fresque|vernissage/i
const EXCLUDE_RX = /opéra|gala|corporate|sponsor|VIP|€[3-9]\d|€\d{3}|private|privé/i

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
      const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|événement|programm|post|item|agenda)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
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

export const frArtSpaces: SourceFetcher = {
  name: 'fr-art-spaces',
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
