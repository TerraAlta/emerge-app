/** UK community art spaces — Assemble, Spike Island, Fruitmarket */
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
    name: 'assemble-studio',
    urls: ['https://assemblestudio.co.uk/events', 'https://www.assemblestudio.co.uk/events'],
    org: 'Assemble Studio', city: 'London', lat: 51.5074, lng: -0.1278,
  },
  {
    name: 'spike-island',
    urls: ['https://www.spikeisland.org.uk/events/', 'https://spikeisland.org.uk/events/'],
    org: 'Spike Island', city: 'Bristol', lat: 51.4444, lng: -2.5943,
  },
  {
    name: 'fruitmarket',
    urls: ['https://www.fruitmarket.co.uk/whats-on/', 'https://fruitmarket.co.uk/whats-on/'],
    org: 'Fruitmarket Gallery', city: 'Edinburgh', lat: 55.9508, lng: -3.1874,
  },
]

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
        // Filter: community/participatory events, not pure exhibitions
        return ld.filter(e =>
          /workshop|open|community|participat|walk|studio|making|print|zine|talk/i.test(e.title + ' ' + e.description) ||
          // Accept all from Assemble (community-led by definition)
          space.name === 'assemble-studio'
        )
      }

      const out: RawEvent[] = []
      const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|exhibition|programme|post)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
      let m
      while ((m = rx.exec(html)) !== null) {
        const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
        if (!t) continue
        const title = stripHtml(t[2]).trim()
        if (!title || title.length < 5) continue
        // Skip purely passive exhibitions unless they have community/participatory element
        if (space.name !== 'assemble-studio' &&
            !/workshop|open|community|participat|walk|studio|making|print|zine/i.test(title + ' ' + stripHtml(m[1]))) continue

        const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+\w+\s+\d{4})/i)
        let starts = new Date().toISOString()
        if (dm) { const p = new Date(dm[1] || dm[2]); if (!isNaN(p.getTime())) starts = p.toISOString() }

        out.push({
          source: space.name, source_id: `${space.name}-${hashStr(title + starts)}`,
          source_url: t[1] ? new URL(t[1], url).toString() : url, title,
          description: `${space.org} community art event. Open studios, workshops, participatory art.`,
          organizer: space.org, location_name: `${space.org}, ${space.city}`,
          lat: space.lat, lng: space.lng, starts_at: starts, cost: 'See event page',
        })
      }
      if (out.length > 0) return out
    } catch { continue }
  }
  return []
}

export const ukArtSpaces: SourceFetcher = {
  name: 'uk-art-spaces',
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
