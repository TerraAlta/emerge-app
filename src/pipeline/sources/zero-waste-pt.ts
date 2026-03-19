/** Zero Waste Portugal — zerowaste.pt — Portuguese zero waste events */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = ['https://zerowaste.pt/eventos/', 'https://zerowaste.pt/agenda/', 'https://www.zerowaste.pt/events/']

function parsePT(s: string): string {
  const m: Record<string,string> = {janeiro:'01',fevereiro:'02','março':'03',abril:'04',maio:'05',junho:'06',julho:'07',agosto:'08',setembro:'09',outubro:'10',novembro:'11',dezembro:'12'}
  const c = s.toLowerCase().trim()
  for (const [k,v] of Object.entries(m)) { if (c.includes(k)) { const d = c.match(/(\d{1,2})\s/); const y = c.match(/(\d{4})/); if(d&&y) return new Date(`${y[1]}-${v}-${d[1].padStart(2,'0')}`).toISOString() } }
  const p = new Date(s); return isNaN(p.getTime()) ? new Date().toISOString() : p.toISOString()
}

export const zeroWastePt: SourceFetcher = {
  name: 'zero-waste-pt',
  async fetch() {
    try {
      const r = await fetch('https://zerowaste.pt/wp-json/tribe/events/v1/events?per_page=30', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'zero-waste-pt', source_id: `zwpt-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'Zero Waste Portugal',
          location_name: e.venue?.venue ?? 'Portugal',
          lat: parseFloat(e.venue?.geo_lat ?? '38.7169'), lng: parseFloat(e.venue?.geo_lng ?? '-9.1393'),
          starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'See event page',
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
        const ld = extractJsonLd(html, 'zero-waste-pt')
        if (ld.length > 0) return ld
        const out: RawEvent[] = []
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|evento|workshop|acao|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
        let m
        while ((m = rx.exec(html)) !== null) {
          const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5 || /^(menu|nav|search)/i.test(title)) continue
          const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+\w+\s+\d{4})/i)
          const starts = dm ? parsePT(dm[1] || dm[2]) : new Date().toISOString()
          out.push({
            source: 'zero-waste-pt', source_id: `zwpt-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: 'Zero Waste Portugal event.',
            organizer: 'Zero Waste Portugal', location_name: 'Portugal',
            lat: 38.7169, lng: -9.1393, starts_at: starts, cost: 'See event page',
          })
        }
        if (out.length > 0) return out
      } catch { continue }
    }
    return []
  },
}
