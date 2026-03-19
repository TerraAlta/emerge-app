/** Philadelphia Orchard Project — phillyorchards.org — community orchard events */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = ['https://www.phillyorchards.org/events/', 'https://phillyorchards.org/events/', 'https://www.phillyorchards.org/volunteer/']

export const phillyOrchardUsa: SourceFetcher = {
  name: 'philly-orchard-usa',
  async fetch() {
    try {
      const r = await fetch('https://www.phillyorchards.org/wp-json/tribe/events/v1/events?per_page=30', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'philly-orchard-usa', source_id: `pop-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'Philadelphia Orchard Project',
          location_name: e.venue?.venue ?? 'Philadelphia',
          lat: parseFloat(e.venue?.geo_lat ?? '39.9526'), lng: parseFloat(e.venue?.geo_lng ?? '-75.1652'),
          starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'Free',
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
        const ld = extractJsonLd(html, 'philly-orchard-usa')
        if (ld.length > 0) return ld
        const out: RawEvent[] = []
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|volunteer|harvest|orchard|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
        let m
        while ((m = rx.exec(html)) !== null) {
          const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5 || /^(menu|nav|search)/i.test(title)) continue
          const dm = m[1].match(/(?:datetime="([^"]*)")|(\w+\s+\d{1,2},?\s+\d{4})/i)
          let starts = new Date().toISOString()
          if (dm) { const p = new Date(dm[1] || dm[2]); if (!isNaN(p.getTime())) starts = p.toISOString() }
          out.push({
            source: 'philly-orchard-usa', source_id: `pop-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: 'Philadelphia Orchard Project event.',
            organizer: 'Philadelphia Orchard Project', location_name: 'Philadelphia',
            lat: 39.9526, lng: -75.1652, starts_at: starts, cost: 'Free',
          })
        }
        if (out.length > 0) return out
      } catch { continue }
    }
    return []
  },
}
