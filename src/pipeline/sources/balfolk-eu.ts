/** Balfolk.eu — balfolk.eu/events — European community folk dance and music events */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

export const balfolkEu: SourceFetcher = {
  name: 'balfolk-eu',
  async fetch() {
    const all: RawEvent[] = []
    // Try the events listing page
    const urls = [
      'https://balfolk.eu/events/',
      'https://www.balfolk.eu/events/',
      'https://balfolk.eu/agenda/',
    ]
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(12000),
        })
        if (!r.ok) continue
        const html = await r.text()

        // Try JSON-LD first
        const ld = extractJsonLd(html, 'balfolk-eu')
        if (ld.length > 0) return ld

        // Fallback: parse event blocks
        const rx = /<(?:article|div|li|tr)[^>]*class="[^"]*(?:event|bal|dance|concert)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|tr)>/gi
        let m
        while ((m = rx.exec(html)) !== null) {
          const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5) continue

          const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}[\s./-]+\w+[\s./-]+\d{4})/i)
          let starts = new Date().toISOString()
          if (dm) {
            const p = new Date(dm[1] || dm[2])
            if (!isNaN(p.getTime())) starts = p.toISOString()
          }

          // Try to extract location
          const locMatch = m[1].match(/(?:location|venue|city|lieu)[\s:]*([^<]{3,60})/i)
          const location = locMatch ? stripHtml(locMatch[1]).trim() : 'Europe'

          all.push({
            source: 'balfolk-eu',
            source_id: `bf-${hashStr(title + starts)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url,
            title,
            description: `Balfolk community dance event. Traditional folk music and participatory dancing — everyone welcome, no experience needed.`,
            organizer: 'Balfolk community',
            location_name: location,
            lat: 50.8503, lng: 4.3517, // Default Brussels, geocoder will fix
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
