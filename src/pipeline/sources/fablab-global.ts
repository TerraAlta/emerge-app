/** Fab Lab Network — labs & maker events worldwide */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const API = 'https://api.fablabs.io/0/labs.json'
const BASE = 'https://fablabs.io'
const URLS = [`${BASE}/labs`, `${BASE}/events`]

export const fablabGlobal: SourceFetcher = {
  name: 'fablab-global',
  async fetch() {
    // 1. Try Fab Labs API — labs as permanent "open workshop" events
    try {
      const r = await fetch(API, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const data = await r.json()
        const labs: any[] = Array.isArray(data) ? data : data.labs ?? []
        if (labs.length > 0) return labs.slice(0, 50).map(l => ({
          source: 'fablab-global', source_id: `fablab-${l.id ?? hashStr(l.name ?? '')}`,
          source_url: l.url ?? `${BASE}/labs/${l.slug ?? l.id}`,
          title: `Fab Lab: ${l.name ?? 'Unknown'}`,
          description: stripHtml(l.description ?? l.blurb ?? '').slice(0, 500) || 'Open maker workshop.',
          organizer: 'Fab Lab Network',
          location_name: [l.city, l.country_code].filter(Boolean).join(', ') || 'See listing',
          lat: parseFloat(l.latitude ?? l.lat ?? '0'),
          lng: parseFloat(l.longitude ?? l.lng ?? '0'),
          starts_at: new Date().toISOString(), cost: 'Free / See lab page',
        }))
      }
    } catch {}

    // 2. HTML scrape fallback
    for (const url of URLS) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) continue
        const html = await r.text()
        const ld = extractJsonLd(html, 'fablab-global')
        if (ld.length > 0) return ld
        const ev = scrape(html, url)
        if (ev.length > 0) return ev
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, base: string): RawEvent[] {
  const out: RawEvent[] = []
  const rx = /<(?:article|div|li|section)[^>]*class="[^"]*(?:lab|event|workshop|maker|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
  let m
  while ((m = rx.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5 || /^(menu|nav|search|cookie)/i.test(title)) continue
    const dm = m[1].match(/(?:datetime="([^"]*)")|(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i)
    let starts = new Date().toISOString()
    if (dm) { const p = new Date(dm[1] || dm[2]); if (!isNaN(p.getTime())) starts = p.toISOString() }
    const desc = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    out.push({
      source: 'fablab-global', source_id: `fablab-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], base).toString() : base, title,
      description: desc ? stripHtml(desc[1]).slice(0, 500) : 'Fab Lab maker event.',
      organizer: 'Fab Lab Network', location_name: 'Global', lat: 0, lng: 0,
      starts_at: starts, cost: 'See event page',
    })
  }
  return out
}
