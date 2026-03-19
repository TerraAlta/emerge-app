/**
 * Permakultur Schweiz — permaculture.ch / permakultur.ch / permaculture-suisse.ch
 * Swiss permaculture courses, workshops, events (DE/FR).
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractMultiDate, geocodeSwiss } from './ch-mt-utils'

const SITES = [
  'https://www.permaculture.ch',
  'https://www.permakultur.ch',
  'https://permaculture-suisse.ch',
]
const PATHS = ['/events/', '/veranstaltungen/', '/agenda/']

export const permacultureCh: SourceFetcher = {
  name: 'permaculture-ch',
  async fetch() {
    // Try Tribe Events API on each site
    for (const base of SITES) {
      try {
        const apiRes = await fetch(`${base}/wp-json/tribe/events/v1/events?per_page=20`, {
          headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
        })
        if (apiRes.ok) {
          const data = await apiRes.json()
          if (data.events?.length > 0) {
            return data.events.map((e: any) => {
              const geo = geocodeSwiss(e.venue?.city || e.venue?.venue || '')
              return {
                source: 'permaculture-ch', source_id: `pk-ch-${e.id}`,
                source_url: e.url ?? `${base}/events/`, title: stripHtml(e.title ?? ''),
                description: stripHtml(e.description ?? '').slice(0, 500),
                organizer: e.organizer?.[0]?.organizer ?? 'Permakultur Schweiz',
                location_name: e.venue?.venue ?? e.venue?.city ?? 'Schweiz',
                lat: parseFloat(e.venue?.geo_lat ?? '0') || geo?.lat || 0,
                lng: parseFloat(e.venue?.geo_lng ?? '0') || geo?.lng || 0,
                starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'Siehe Veranstaltung',
              }
            })
          }
        }
      } catch {}
    }

    // Fallback: try HTML pages
    for (const base of SITES) {
      for (const path of PATHS) {
        try {
          const res = await fetch(`${base}${path}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
            signal: AbortSignal.timeout(10000),
          })
          if (!res.ok) continue
          const html = await res.text()
          const jsonLd = extractJsonLd(html, 'permaculture-ch')
          if (jsonLd.length > 0) return jsonLd
          const events = scrapeHtml(html, `${base}${path}`)
          if (events.length > 0) return events
        } catch { continue }
      }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|veranstaltung|kurs|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const geo = geocodeSwiss(block)
    events.push({
      source: 'permaculture-ch', source_id: `pk-ch-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl, title,
      description: 'Permakultur Schweiz Veranstaltung.', organizer: 'Permakultur Schweiz',
      location_name: geo ? 'Schweiz' : 'Schweiz',
      lat: geo?.lat || 0, lng: geo?.lng || 0,
      starts_at: extractMultiDate(block), cost: 'Siehe Veranstaltung',
    })
  }
  return events
}
