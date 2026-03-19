/**
 * PERMA-PROJECTS — perma-projects.be
 * Flemish permaculture project network.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://www.perma-projects.be'
const URLS = [`${BASE}/agenda`, `${BASE}/evenementen`, `${BASE}/events`]
const DEF = { lat: 50.8503, lng: 4.3517 }

function parseBE(s: string): string {
  const m: Record<string,string> = {januari:'01',februari:'02',maart:'03',april:'04',mei:'05',juni:'06',juli:'07',augustus:'08',september:'09',oktober:'10',november:'11',december:'12',janvier:'01',février:'02',mars:'03',avril:'04',mai:'05',juin:'06',juillet:'07',août:'08',septembre:'09',octobre:'10',novembre:'11',décembre:'12'}
  const c = s.toLowerCase().trim()
  for (const [k,v] of Object.entries(m)) { if (c.includes(k)) { const d = c.match(/(\d{1,2})\s/); const y = c.match(/(\d{4})/); if(d&&y) return new Date(`${y[1]}-${v}-${d[1].padStart(2,'0')}`).toISOString() } }
  const p = new Date(s); return isNaN(p.getTime()) ? new Date().toISOString() : p.toISOString()
}

export const permaProjectsBe: SourceFetcher = {
  name: 'perma-projects-be',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        try {
          const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: 'perma-projects-be', source_id: `pp-be-${e.id}`,
                source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? 'PERMA-PROJECTS',
                location_name: e.venue?.venue ?? e.venue?.city ?? 'Vlaanderen',
                lat: parseFloat(e.venue?.geo_lat ?? '0') || DEF.lat,
                lng: parseFloat(e.venue?.geo_lng ?? '0') || DEF.lng,
                starts_at: new Date(e.start_date).toISOString(),
                cost: e.cost ?? 'Zie evenement',
              }))
            }
          }
        } catch {}

        const jsonLd = extractJsonLd(html, 'perma-projects-be')
        if (jsonLd.length > 0) return jsonLd

        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|evenement|project|permacultuur|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const loc = block.match(/(?:class="[^"]*(?:locatie|location|plaats)[^"]*"[^>]*>)([\s\S]*?)<\//i)
    const locName = loc ? stripHtml(loc[1]).trim() : 'Vlaanderen'
    events.push({
      source: 'perma-projects-be', source_id: `pp-be-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'PERMA-PROJECTS evenement. Zie link voor details.',
      organizer: 'PERMA-PROJECTS', location_name: locName,
      lat: DEF.lat, lng: DEF.lng,
      starts_at: parseBE(block), cost: 'Zie evenement',
    })
  }
  return events
}
