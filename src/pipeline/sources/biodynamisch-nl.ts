/**
 * Biodynamische Vereniging — bdvereniging.nl
 * Dutch biodynamic farming association events and courses.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://www.bdvereniging.nl/agenda/',
  'https://www.bdvereniging.nl/evenementen/',
]
const ORG = 'Biodynamische Vereniging'
const SRC = 'biodynamisch-nl'
const DEF = { lat: 52.3676, lng: 4.9041 }

function parseNL(s: string): string {
  const m: Record<string,string> = {januari:'01',februari:'02',maart:'03',april:'04',mei:'05',juni:'06',juli:'07',augustus:'08',september:'09',oktober:'10',november:'11',december:'12'}
  const c = s.toLowerCase().trim()
  for (const [k,v] of Object.entries(m)) { if (c.includes(k)) { const d = c.match(/(\d{1,2})\s/); const y = c.match(/(\d{4})/); if(d&&y) return new Date(`${y[1]}-${v}-${d[1].padStart(2,'0')}`).toISOString() } }
  const p = new Date(s); return isNaN(p.getTime()) ? new Date().toISOString() : p.toISOString()
}

export const biodynamischNl: SourceFetcher = {
  name: SRC,
  async fetch(opts: { lat: number; lng: number; radiusKm: number }) {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        // Tier 1: WP / Tribe Events API
        const base = new URL(url).origin
        try {
          const apiRes = await fetch(`${base}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length) return data.events.map((e: any) => ({
              source: SRC, source_id: `bd-${e.id}`, source_url: e.url ?? url,
              title: stripHtml(e.title ?? ''), description: stripHtml(e.description ?? '').slice(0, 500),
              organizer: e.organizer?.[0]?.organizer ?? ORG,
              location_name: e.venue?.venue ?? e.venue?.city ?? 'Nederland',
              lat: parseFloat(e.venue?.geo_lat ?? '0') || DEF.lat,
              lng: parseFloat(e.venue?.geo_lng ?? '0') || DEF.lng,
              starts_at: new Date(e.start_date).toISOString(), ends_at: e.end_date ? new Date(e.end_date).toISOString() : null,
              cost: e.cost ?? 'Zie evenement',
            }))
          }
        } catch {}

        // Tier 2: JSON-LD
        const jsonLd = extractJsonLd(html, SRC)
        if (jsonLd.length > 0) return jsonLd

        // Tier 3: HTML scrape
        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|evenement|agenda|cursus|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: SRC, source_id: `bd-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: `${ORG} evenement. Zie link voor details.`,
      organizer: ORG, location_name: 'Nederland',
      lat: DEF.lat, lng: DEF.lng, starts_at: parseNL(block), cost: 'Zie evenement',
    })
  }
  return events
}
