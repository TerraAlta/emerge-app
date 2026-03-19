/**
 * HelpX — helpx.net (MEMBERSHIP-WALLED)
 * Volunteer and cultural exchange platform.
 * Requires membership for full host details; no public API.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

export const helpxGlobal: SourceFetcher = {
  name: 'helpx-global',
  async fetch() {
    // 1. Try public host list
    try {
      const r = await fetch('https://www.helpx.net/hostlist.asp', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const html = await r.text()
        const ld = extractJsonLd(html, 'helpx-global')
        if (ld.length > 0) return ld
        const ev = scrape(html)
        if (ev.length > 0) return ev
      }
    } catch {}

    // 2. Try any API endpoints
    for (const path of ['/api/hosts', '/api/listings', '/hostlist.json']) {
      try {
        const r = await fetch(`https://www.helpx.net${path}`, {
          headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
        })
        if (r.ok) {
          const d = await r.json()
          const items = Array.isArray(d) ? d : d.hosts ?? d.data ?? []
          if (items.length > 0) return items.slice(0, 30).map((h: any) => ({
            source: 'helpx-global', source_id: `hx-${h.id ?? hashStr(h.name ?? '')}`,
            source_url: h.url ?? 'https://www.helpx.net',
            title: `HelpX — ${stripHtml(h.name ?? h.title ?? 'Host')}`,
            description: stripHtml(h.description ?? '').slice(0, 500),
            organizer: 'HelpX', location_name: h.country ?? h.location ?? 'See listing',
            lat: parseFloat(h.lat ?? '0'), lng: parseFloat(h.lng ?? '0'),
            starts_at: new Date().toISOString(), cost: 'Membership required (~€20/2yr)',
          }))
        }
      } catch {}
    }

    // Both approaches failed — membership wall
    console.log('[helpx-global] HelpX requires membership. No public API available.')
    return []
  },
}

function scrape(html: string): RawEvent[] {
  const out: RawEvent[] = []
  const rx = /<(?:article|div|li|tr|section)[^>]*class="[^"]*(?:host|listing|helper)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|tr|section)>/gi
  let m
  while ((m = rx.exec(html)) !== null) {
    const t = m[1].match(/<(?:h[234]|a|td)[^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/(?:h[234]|a|td)>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 3 || /^(menu|nav|search|cookie)/i.test(title)) continue
    const desc = m[1].match(/<(?:p|td)[^>]*>([\s\S]*?)<\/(?:p|td)>/i)
    out.push({
      source: 'helpx-global', source_id: `hx-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], 'https://www.helpx.net').toString() : 'https://www.helpx.net',
      title: `HelpX — ${title}`,
      description: desc ? stripHtml(desc[1]).slice(0, 500) : 'Volunteer exchange host.',
      organizer: 'HelpX', location_name: 'See listing', lat: 0, lng: 0,
      starts_at: new Date().toISOString(), cost: 'Membership required (~€20/2yr)',
    })
  }
  return out
}
