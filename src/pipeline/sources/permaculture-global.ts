/**
 * Permaculture Global — permacultureglobal.org
 * Project directory and events from the global permaculture network.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const BASE = 'https://permacultureglobal.org'
const URLS = [`${BASE}/projects`, `${BASE}/events`]

export const permacultureGlobal: SourceFetcher = {
  name: 'permaculture-global',
  async fetch() {
    for (const url of URLS) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) continue
        const html = await r.text()

        // 1. JSON-LD
        const ld = extractJsonLd(html, 'permaculture-global')
        if (ld.length > 0) return ld

        // 2. Embedded JSON data (project map data, inline JS objects)
        const jsonData = html.match(/(?:var|let|const)\s+\w+\s*=\s*(\[[\s\S]*?\]);/g) ?? []
        for (const chunk of jsonData) {
          try {
            const arr = JSON.parse(chunk.replace(/^[^[]*/, '').replace(/;$/, ''))
            if (Array.isArray(arr) && arr.length > 0 && (arr[0].lat || arr[0].latitude || arr[0].name)) {
              return arr.slice(0, 50).map((p: any) => ({
                source: 'permaculture-global', source_id: `pg-${p.id ?? hashStr(p.name ?? '')}`,
                source_url: p.url ?? `${BASE}/projects/${p.slug ?? p.id ?? ''}`,
                title: stripHtml(p.name ?? p.title ?? ''),
                description: stripHtml(p.description ?? p.summary ?? '').slice(0, 500),
                organizer: 'Permaculture Global',
                location_name: p.location ?? p.country ?? 'See project page',
                lat: parseFloat(p.lat ?? p.latitude ?? '0'),
                lng: parseFloat(p.lng ?? p.longitude ?? '0'),
                starts_at: p.date ? new Date(p.date).toISOString() : new Date().toISOString(),
                cost: 'See project page',
              }))
            }
          } catch {}
        }

        // 3. HTML scrape
        const ev = scrape(html, url)
        if (ev.length > 0) return ev
      } catch { continue }
    }
    return []
  },
}

function scrape(html: string, base: string): RawEvent[] {
  const out: RawEvent[] = []
  const rx = /<(?:article|div|li|section)[^>]*class="[^"]*(?:event|project|listing|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
  let m
  while ((m = rx.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5 || /^(menu|nav|search|cookie)/i.test(title)) continue
    const desc = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    out.push({
      source: 'permaculture-global', source_id: `pg-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], base).toString() : base, title,
      description: desc ? stripHtml(desc[1]).slice(0, 500) : 'Permaculture project or event.',
      organizer: 'Permaculture Global', location_name: 'See page', lat: 0, lng: 0,
      starts_at: new Date().toISOString(), cost: 'See project page',
    })
  }
  return out
}
