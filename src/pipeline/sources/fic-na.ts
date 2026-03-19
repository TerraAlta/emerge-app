/**
 * FIC — Fellowship for Intentional Community — ic.org
 * Has a community directory with API. Events, open days, visitor programs.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { geocodeNaCity } from './na-utils'

const BASE = 'https://www.ic.org'

export const ficNa: SourceFetcher = {
  name: 'fic-na',
  async fetch() {
    // Strategy 1: Their directory API
    try {
      const res = await fetch(`${BASE}/wp-json/wp/v2/directory?per_page=20&_fields=id,title,link,excerpt,acf`, {
        headers: { 'User-Agent': 'Emerge-App/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          return data.map((c: any) => {
            const title = stripHtml(c.title?.rendered ?? '')
            const geo = geocodeNaCity(c.acf?.location ?? c.acf?.city ?? title)
            return {
              source: 'fic-na',
              source_id: `fic-${c.id}`,
              source_url: c.link ?? `${BASE}/directory/`,
              title: `Community — ${title}`,
              description: stripHtml(c.excerpt?.rendered ?? '').slice(0, 500),
              organizer: title,
              location_name: c.acf?.location ?? c.acf?.city ?? 'North America',
              lat: parseFloat(c.acf?.latitude ?? '0') || geo?.lat || 0,
              lng: parseFloat(c.acf?.longitude ?? '0') || geo?.lng || 0,
              starts_at: new Date().toISOString(),
              cost: 'See listing',
            }
          })
        }
      }
    } catch {}

    // Strategy 2: Events page
    try {
      const res = await fetch(`${BASE}/events/`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return []
      const html = await res.text()

      const jsonLd = extractJsonLd(html, 'fic-na')
      if (jsonLd.length > 0) return jsonLd

      // Tribe Events API
      try {
        const apiRes = await fetch(`${BASE}/wp-json/tribe/events/v1/events?per_page=20`, {
          headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
        })
        if (apiRes.ok) {
          const data = await apiRes.json()
          if (data.events?.length > 0) {
            return data.events.map((e: any) => ({
              source: 'fic-na',
              source_id: `fic-${e.id}`,
              source_url: e.url ?? `${BASE}/events/`,
              title: stripHtml(e.title ?? ''),
              description: stripHtml(e.description ?? '').slice(0, 500),
              organizer: e.organizer?.[0]?.organizer ?? 'FIC',
              location_name: e.venue?.venue ?? e.venue?.city ?? 'North America',
              lat: parseFloat(e.venue?.geo_lat ?? '0'),
              lng: parseFloat(e.venue?.geo_lng ?? '0'),
              starts_at: new Date(e.start_date).toISOString(),
              cost: e.cost ?? 'See event',
            }))
          }
        }
      } catch {}

      return scrape(html)
    } catch (err) {
      console.warn('[fic-na] failed:', (err as Error).message)
      return []
    }
  },
}

function scrape(html: string): RawEvent[] {
  const events: RawEvent[] = []
  const pattern = /<(?:article|div)[^>]*class="[^"]*(?:event|tribe|community|listing)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div)>/gi
  let m
  while ((m = pattern.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    events.push({
      source: 'fic-na', source_id: `fic-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], BASE).toString() : `${BASE}/events/`,
      title, description: 'FIC event. See link for details.',
      organizer: 'Fellowship for Intentional Community',
      location_name: 'North America', lat: 0, lng: 0,
      starts_at: new Date().toISOString(), cost: 'See event',
    })
  }
  return events
}
