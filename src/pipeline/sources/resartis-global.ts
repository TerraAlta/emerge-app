/** Resartis — resartis.org — artist residency open days and public events at ecological/community spaces */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

export const resartisGlobal: SourceFetcher = {
  name: 'resartis-global',
  async fetch() {
    const all: RawEvent[] = []
    const urls = [
      'https://resartis.org/listings/?type=event',
      'https://resartis.org/events/',
      'https://www.resartis.org/events/',
    ]
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(12000),
        })
        if (!r.ok) continue
        const html = await r.text()

        // Try JSON-LD
        const ld = extractJsonLd(html, 'resartis-global')
        if (ld.length > 0) {
          // Filter: only open days / public events, not residency calls
          return ld.filter(e =>
            /open|public|exhibition|workshop|tour|community/i.test(e.title + ' ' + e.description) &&
            !/deadline|apply|submission|call for|residency application/i.test(e.title + ' ' + e.description)
          )
        }

        // Fallback: parse event blocks
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|listing|residency|post)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
        let m
        while ((m = rx.exec(html)) !== null) {
          const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5) continue

          // Skip residency calls — only want public events
          if (/deadline|apply|submission|call for|residency application/i.test(title)) continue

          const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+\w+\s+\d{4})/i)
          let starts = new Date().toISOString()
          if (dm) {
            const p = new Date(dm[1] || dm[2])
            if (!isNaN(p.getTime())) starts = p.toISOString()
          }

          const locMatch = m[1].match(/(?:location|venue|city|country)[\s:]*([^<]{3,60})/i)

          all.push({
            source: 'resartis-global',
            source_id: `res-${hashStr(title + starts)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url,
            title,
            description: `Artist residency open event. Public viewing, community engagement, or ecological art. ${stripHtml(m[1]).slice(0, 200)}`,
            organizer: 'Resartis network',
            location_name: locMatch ? stripHtml(locMatch[1]).trim() : 'International',
            lat: 48.8566, lng: 2.3522, // Default Paris, geocoder will fix
            starts_at: starts,
            cost: 'See event page',
          })
        }
        if (all.length > 0) break
      } catch { continue }
    }
    return all
  },
}
