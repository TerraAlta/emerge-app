/** Schnippeldisko Germany — schnippeldisko.de — community surplus food cooking */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = ['https://schnippeldisko.de/events/', 'https://schnippeldisko.de/veranstaltungen/', 'https://www.schnippeldisko.de/events/']

function parseDE(s: string): string {
  const m: Record<string,string> = {januar:'01',februar:'02','märz':'03',april:'04',mai:'05',juni:'06',juli:'07',august:'08',september:'09',oktober:'10',november:'11',dezember:'12'}
  const c = s.toLowerCase().replace(/\./g,'').trim()
  for (const [k,v] of Object.entries(m)) { if (c.includes(k)) { const d = c.match(/(\d{1,2})\s/); const y = c.match(/(\d{4})/); if(d&&y) return new Date(`${y[1]}-${v}-${d[1].padStart(2,'0')}`).toISOString() } }
  const p = new Date(s); return isNaN(p.getTime()) ? new Date().toISOString() : p.toISOString()
}

export const schnippeldiskoDe: SourceFetcher = {
  name: 'schnippeldisko-de',
  async fetch() {
    try {
      const r = await fetch('https://schnippeldisko.de/wp-json/tribe/events/v1/events?per_page=30', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'schnippeldisko-de', source_id: `sd-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'Schnippeldisko',
          location_name: e.venue?.venue ?? 'Germany',
          lat: parseFloat(e.venue?.geo_lat ?? '52.5200'), lng: parseFloat(e.venue?.geo_lng ?? '13.4050'),
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
        const ld = extractJsonLd(html, 'schnippeldisko-de')
        if (ld.length > 0) return ld
        const out: RawEvent[] = []
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|veranstaltung|kochen|schnippel|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
        let m
        while ((m = rx.exec(html)) !== null) {
          const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5 || /^(menu|nav|search)/i.test(title)) continue
          const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\.?\s+\w+\s+\d{4})/i)
          const starts = dm ? parseDE(dm[1] || dm[2]) : new Date().toISOString()
          out.push({
            source: 'schnippeldisko-de', source_id: `sd-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: 'Schnippeldisko community cooking event.',
            organizer: 'Schnippeldisko', location_name: 'Germany',
            lat: 52.5200, lng: 13.4050, starts_at: starts, cost: 'Free',
          })
        }
        if (out.length > 0) return out
      } catch { continue }
    }
    return []
  },
}
