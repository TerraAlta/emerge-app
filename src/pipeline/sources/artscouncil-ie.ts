/** Arts Council Ireland — artscouncil.ie — community art projects and open events */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://www.artscouncil.ie/Events/',
  'https://artscouncil.ie/Events/',
  'https://www.artscouncil.ie/What-we-do/Participation/',
]

export const artscouncilIe: SourceFetcher = {
  name: 'artscouncil-ie',
  async fetch() {
    const all: RawEvent[] = []

    for (const url of URLS) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(12000),
        })
        if (!r.ok) continue
        const html = await r.text()

        // Try JSON-LD first
        const ld = extractJsonLd(html, 'artscouncil-ie')
        if (ld.length > 0) {
          // Filter: community/participatory events only, not grant deadlines or admin
          return ld.filter(e =>
            /community|participat|open|workshop|mural|studio|walk|residency/i.test(e.title + ' ' + e.description) &&
            !/deadline|application|grant|funding|submission/i.test(e.title)
          )
        }

        // Fallback: parse event blocks
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|listing|news|item)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
        let m
        while ((m = rx.exec(html)) !== null) {
          const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5) continue

          // Skip grant/funding/admin items
          if (/deadline|application|grant|funding|submission|vacancy/i.test(title)) continue
          // Only want community/participatory/open events
          if (!/community|open|workshop|mural|studio|walk|participat|art|exhibition|festival/i.test(title + ' ' + stripHtml(m[1]))) continue

          const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+\w+\s+\d{4})/i)
          let starts = new Date().toISOString()
          if (dm) { const p = new Date(dm[1] || dm[2]); if (!isNaN(p.getTime())) starts = p.toISOString() }

          all.push({
            source: 'artscouncil-ie', source_id: `aci-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: `Arts Council Ireland community event. Participatory art, open studios, community projects.`,
            organizer: 'Arts Council Ireland', location_name: 'Ireland',
            lat: 53.3498, lng: -6.2603, starts_at: starts, cost: 'See event page',
          })
        }
        if (all.length > 0) break
      } catch { continue }
    }
    return all
  },
}
