/**
 * Aldeia do Vale — aldeiadovale.com/eventos
 * Community project with volunteering, workshops and events in Portugal.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = ['https://aldeiadovale.com/eventos', 'https://aldeiadovale.com/events']
const SRC = 'aldeia-do-vale-pt'
const ORG = 'Aldeia do Vale'
const DEFAULT_LAT = 40.2
const DEFAULT_LNG = -8.0

const PT_MONTHS: Record<string, number> = {
  janeiro: 0, fevereiro: 1, março: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
}

function extractPtDate(html: string): string {
  const dt = html.match(/datetime="([^"]*)"/)
  if (dt) { const d = new Date(dt[1]); if (!isNaN(d.getTime())) return d.toISOString() }
  const m = html.match(/(\d{1,2})\s+(?:de\s+)?(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(?:de\s+)?(\d{4})/i)
  if (m) { const mo = PT_MONTHS[m[2].toLowerCase()]; if (mo !== undefined) return new Date(parseInt(m[3]), mo, parseInt(m[1])).toISOString() }
  const dd = html.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (dd) return new Date(parseInt(dd[3]), parseInt(dd[2]) - 1, parseInt(dd[1])).toISOString()
  return new Date().toISOString()
}

export const aldeiaDoValePt: SourceFetcher = {
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
          const base = new URL(url).origin
          const apiRes = await fetch(`${base}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => ({
                source: SRC, source_id: `adv-${e.id}`, source_url: e.url ?? url,
                title: stripHtml(e.title ?? ''), description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? ORG,
                location_name: e.venue?.venue ?? 'Aldeia do Vale, Portugal',
                lat: parseFloat(e.venue?.geo_lat ?? '0') || DEFAULT_LAT,
                lng: parseFloat(e.venue?.geo_lng ?? '0') || DEFAULT_LNG,
                starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'Ver evento',
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
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|evento|voluntariado|workshop|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: SRC, source_id: `adv-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl, title,
      description: 'Evento Aldeia do Vale. Ver link para detalhes.', organizer: ORG,
      location_name: 'Aldeia do Vale, Portugal',
      lat: DEFAULT_LAT, lng: DEFAULT_LNG,
      starts_at: extractPtDate(block), cost: 'Ver evento',
    })
  }
  return events
}
