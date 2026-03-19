/**
 * Workaway — workaway.info (MEMBERSHIP-WALLED)
 * Cultural exchange and volunteering platform.
 * Requires paid membership for full access; no public API without partner application.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

export const workawayGlobal: SourceFetcher = {
  name: 'workaway-global',
  async fetch() {
    // 1. Try public host list page
    try {
      const r = await fetch('https://www.workaway.info/en/hostlist', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const html = await r.text()
        const ld = extractJsonLd(html, 'workaway-global')
        if (ld.length > 0) return ld
        const ev = scrape(html)
        if (ev.length > 0) return ev
      }
    } catch {}

    // 2. Try public API
    try {
      const r = await fetch('https://www.workaway.info/api/hosts?limit=30', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        const items = Array.isArray(d) ? d : d.hosts ?? d.data ?? []
        if (items.length > 0) return items.slice(0, 30).map((h: any) => ({
          source: 'workaway-global', source_id: `wa-${h.id ?? hashStr(h.name ?? '')}`,
          source_url: h.url ?? 'https://www.workaway.info',
          title: `Workaway — ${stripHtml(h.name ?? h.title ?? 'Host')}`,
          description: stripHtml(h.description ?? '').slice(0, 500),
          organizer: 'Workaway', location_name: h.country ?? h.location ?? 'See listing',
          lat: parseFloat(h.lat ?? '0'), lng: parseFloat(h.lng ?? '0'),
          starts_at: new Date().toISOString(), cost: 'Membership required (~€49/yr)',
        }))
      }
    } catch {}

    // Both approaches failed — membership wall
    console.log(
      '[workaway-global] Workaway requires partner API application. ' +
      'Apply at https://www.workaway.info/en/about/api-partners'
    )
    return []
  },
}

function scrape(html: string): RawEvent[] {
  const out: RawEvent[] = []
  const rx = /<(?:article|div|li|section)[^>]*class="[^"]*(?:host|listing|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|section)>/gi
  let m
  while ((m = rx.exec(html)) !== null) {
    const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5 || /^(menu|nav|search|cookie)/i.test(title)) continue
    const desc = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    out.push({
      source: 'workaway-global', source_id: `wa-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], 'https://www.workaway.info').toString() : 'https://www.workaway.info',
      title: `Workaway — ${title}`,
      description: desc ? stripHtml(desc[1]).slice(0, 500) : 'Volunteer exchange opportunity.',
      organizer: 'Workaway', location_name: 'See listing', lat: 0, lng: 0,
      starts_at: new Date().toISOString(), cost: 'Membership required (~€49/yr)',
    })
  }
  return out
}
