/** Real Junk Food Project — therealjunkfoodproject.org — pay-as-you-feel cafés */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = ['https://therealjunkfoodproject.org/events/', 'https://www.therealjunkfoodproject.org/events/', 'https://therealjunkfoodproject.org/find-a-cafe/']

export const realJunkFoodUk: SourceFetcher = {
  name: 'real-junk-food-uk',
  async fetch() {
    try {
      const r = await fetch('https://therealjunkfoodproject.org/wp-json/tribe/events/v1/events?per_page=30', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'real-junk-food-uk', source_id: `rjfp-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'The Real Junk Food Project',
          location_name: e.venue?.venue ?? 'UK',
          lat: parseFloat(e.venue?.geo_lat ?? '53.8008'), lng: parseFloat(e.venue?.geo_lng ?? '-1.5491'),
          starts_at: new Date(e.start_date).toISOString(), cost: 'Pay as you feel',
        }))
      }
    } catch {}
    for (const url of URLS) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) continue
        const html = await r.text()
        const ld = extractJsonLd(html, 'real-junk-food-uk')
        if (ld.length > 0) return ld
        const out: RawEvent[] = []
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|cafe|project|location|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
        let m
        while ((m = rx.exec(html)) !== null) {
          const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5 || /^(menu|nav|search)/i.test(title)) continue
          const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+\w+\s+\d{4})/i)
          let starts = new Date().toISOString()
          if (dm) { const p = new Date(dm[1] || dm[2]); if (!isNaN(p.getTime())) starts = p.toISOString() }
          out.push({
            source: 'real-junk-food-uk', source_id: `rjfp-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: 'Real Junk Food Project pay-as-you-feel café.',
            organizer: 'The Real Junk Food Project', location_name: 'UK',
            lat: 53.8008, lng: -1.5491, starts_at: starts, cost: 'Pay as you feel',
          })
        }
        if (out.length > 0) return out
      } catch { continue }
    }
    return []
  },
}
