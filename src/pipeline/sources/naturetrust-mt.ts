/**
 * Nature Trust Malta — naturetrust.org.mt
 * Volunteer and habitat restoration events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractMultiDate, geocodeMalta } from './ch-mt-utils'
const URLS = [
  'https://naturetrust.org.mt/events/',
  'https://www.naturetrustmalta.org/events/',
]

export const naturetrustMt: SourceFetcher = {
  name: 'naturetrust-mt',
  async fetch() {
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const html = await res.text()

        const jsonLd = extractJsonLd(html, 'naturetrust-mt')
        if (jsonLd.length > 0) return jsonLd

        const base = new URL(url).origin
        try {
          const apiRes = await fetch(`${base}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              return data.events.map((e: any) => {
                const geo = geocodeMalta(e.venue?.city || e.venue?.venue || '')
                return {
                  source: 'naturetrust-mt', source_id: `ntrust-mt-${e.id}`,
                  source_url: e.url ?? url, title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: e.organizer?.[0]?.organizer ?? 'Nature Trust Malta',
                  location_name: e.venue?.venue ?? e.venue?.city ?? 'Malta',
                  lat: parseFloat(e.venue?.geo_lat ?? '0') || geo?.lat || 35.9375,
                  lng: parseFloat(e.venue?.geo_lng ?? '0') || geo?.lng || 14.3754,
                  starts_at: new Date(e.start_date).toISOString(),
                  cost: e.cost ?? 'See event',
                } satisfies RawEvent
              })
            }
          }
        } catch {}

        const events = scrapeHtml(html, url)
        if (events.length > 0) return events
      } catch { continue }
    }
    return []
  },
}

function scrapeHtml(html: string, baseUrl: string): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|volunteer|restoration|cleanup|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const locM = block.match(/(?:class="[^"]*(?:location|venue|place)[^"]*"[^>]*>)([\s\S]*?)<\//i)
    const location = locM ? stripHtml(locM[1]).trim() : 'Malta'
    const geo = geocodeMalta(location + ' ' + block)
    events.push({
      source: 'naturetrust-mt', source_id: `ntrust-mt-${hashStr(title)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl,
      title, description: 'Nature conservation event. See link for details.',
      organizer: 'Nature Trust Malta', location_name: location,
      lat: geo?.lat || 35.9375, lng: geo?.lng || 14.3754,
      starts_at: extractMultiDate(block), cost: 'See event',
    })
  }
  return events
}
