/**
 * Degrowth — degrowth.info
 * International degrowth movement hub, based in Germany. Conferences, workshops, events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://degrowth.info'
const URLS = [`${BASE}/en/events`, `${BASE}/de/veranstaltungen`]
const LAT = 52.5200, LNG = 13.4050

function parseDE(s: string): string {
  const m: Record<string, string> = { januar:'01',februar:'02','märz':'03',april:'04',mai:'05',juni:'06',juli:'07',august:'08',september:'09',oktober:'10',november:'11',dezember:'12' }
  const c = s.toLowerCase().replace(/\./g,'').trim()
  for (const [k,v] of Object.entries(m)) { if (c.includes(k)) { const d = c.match(/(\d{1,2})\s/); const y = c.match(/(\d{4})/); if (d&&y) return new Date(`${y[1]}-${v}-${d[1].padStart(2,'0')}`).toISOString() } }
  const p = new Date(s); return isNaN(p.getTime()) ? new Date().toISOString() : p.toISOString()
}

export const degrowthDe: SourceFetcher = {
  name: 'degrowth-de',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'degrowth-de')
        if (jsonLd.length > 0) return jsonLd

        try {
          const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: 'degrowth-de', source_id: `dg-${e.id}`,
                source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: 'Degrowth',
                location_name: e.venue?.venue ?? 'Deutschland',
                lat: parseFloat(e.venue?.geo_lat ?? LAT), lng: parseFloat(e.venue?.geo_lng ?? LNG),
                starts_at: new Date(e.start_date).toISOString(),
                ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
                cost: e.cost ?? 'Siehe Veranstaltung',
              }))
            }
          }
        } catch {}

        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|veranstaltung|conference|workshop|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5 || /^(menu|nav|search|cookie)/i.test(title)) continue
    const desc = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    events.push({
      source: 'degrowth-de', source_id: `dg-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl, title,
      description: desc ? stripHtml(desc[1]).trim().slice(0, 500) : 'Degrowth event.',
      organizer: 'Degrowth', location_name: 'Deutschland',
      lat: LAT, lng: LNG, starts_at: parseDE(block), cost: 'Siehe Veranstaltung',
    })
  }
  return events
}
