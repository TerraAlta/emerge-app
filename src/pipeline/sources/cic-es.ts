/**
 * Cooperativa Integral Catalana — cooperativaintegral.cat/agenda
 * Catalan integral cooperative: assemblies, workshops, community events.
 * Bilingual Catalan/Spanish date parsing.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = [
  'https://cooperativaintegral.cat/agenda/',
  'https://cooperativaintegral.cat/esdeveniments/',
]
const SRC = 'cic-es'
const ORG = 'Cooperativa Integral Catalana'
const DEFAULT_LAT = 41.3874
const DEFAULT_LNG = 2.1686

function parseES(s: string): string {
  const m: Record<string,string> = {enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'}
  const c = s.toLowerCase().replace(/\bde\b/g,'').trim()
  for (const [k,v] of Object.entries(m)) { if (c.includes(k)) { const d = c.match(/(\d{1,2})\s/); const y = c.match(/(\d{4})/); if(d&&y) return new Date(`${y[1]}-${v}-${d[1].padStart(2,'0')}`).toISOString() } }
  const p = new Date(s); return isNaN(p.getTime()) ? new Date().toISOString() : p.toISOString()
}

function parseCA(s: string): string {
  const m: Record<string,string> = {gener:'01',febrer:'02','març':'03',abril:'04',maig:'05',juny:'06',juliol:'07',agost:'08',setembre:'09',octubre:'10',novembre:'11',desembre:'12'}
  const c = s.toLowerCase().replace(/\bde\b/g,'').replace(/\bd'\b/g,'').trim()
  for (const [k,v] of Object.entries(m)) { if (c.includes(k)) { const d = c.match(/(\d{1,2})\s/); const y = c.match(/(\d{4})/); if(d&&y) return new Date(`${y[1]}-${v}-${d[1].padStart(2,'0')}`).toISOString() } }
  return parseES(s)
}

function extractDate(block: string): string {
  const txt = stripHtml(block)
  const ca = parseCA(txt)
  if (ca !== new Date().toISOString()) return ca
  return parseES(txt)
}

export const cicEs: SourceFetcher = {
  name: SRC,
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, SRC)
        if (jsonLd.length > 0) return jsonLd

        try {
          const origin = new URL(url).origin
          const apiRes = await fetch(`${origin}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: SRC, source_id: `cic-${e.id}`, source_url: e.url ?? url,
                title: stripHtml(e.title ?? ''), description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? ORG,
                location_name: e.venue?.venue ?? e.venue?.city ?? 'Catalunya',
                lat: parseFloat(e.venue?.geo_lat) || DEFAULT_LAT,
                lng: parseFloat(e.venue?.geo_lng) || DEFAULT_LNG,
                starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'Veure event',
              }))
            }
          }
        } catch {}

        return scrapeHtml(html, url)
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|esdeveniment|jornada|assemblea|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: SRC, source_id: `cic-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl, title,
      description: 'Esdeveniment de la Cooperativa Integral Catalana.', organizer: ORG,
      location_name: 'Catalunya', lat: DEFAULT_LAT, lng: DEFAULT_LNG,
      starts_at: extractDate(block), cost: 'Veure event',
    })
  }
  return events
}
