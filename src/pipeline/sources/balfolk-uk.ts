/** Balfolk UK — balfolk.co.uk/events — community folk dance events across UK */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

export const balfolkUk: SourceFetcher = {
  name: 'balfolk-uk',
  async fetch() {
    const urls = ['https://balfolk.co.uk/events/', 'https://www.balfolk.co.uk/events/', 'https://balfolk.co.uk/events/list/']
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(12000),
        })
        if (!r.ok) continue
        const html = await r.text()
        const ld = extractJsonLd(html, 'balfolk-uk')
        if (ld.length > 0) return ld

        const out: RawEvent[] = []
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|bal|dance|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
        let m
        while ((m = rx.exec(html)) !== null) {
          const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5) continue
          const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+\w+\s+\d{4})/i)
          let starts = new Date().toISOString()
          if (dm) { const p = new Date(dm[1] || dm[2]); if (!isNaN(p.getTime())) starts = p.toISOString() }
          const locMatch = m[1].match(/(?:location|venue|city)[\s:]*([^<]{3,60})/i)
          out.push({
            source: 'balfolk-uk', source_id: `bfuk-${hashStr(title + starts)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: 'Balfolk community dance — traditional folk music, everyone welcome, no experience needed.',
            organizer: 'Balfolk UK',
            location_name: locMatch ? stripHtml(locMatch[1]).trim() : 'UK',
            lat: 51.5074, lng: -0.1278, starts_at: starts, cost: 'See event page',
          })
        }
        if (out.length > 0) return out
      } catch { continue }
    }
    return []
  },
}
