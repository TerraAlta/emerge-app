/**
 * Transition Schweiz — Basel, Bern, Genève networks aggregated.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'
import { extractMultiDate, geocodeSwiss } from './ch-mt-utils'

const CITIES: { base: string; city: string; lat: number; lng: number }[] = [
  { base: 'https://www.transition-basel.ch', city: 'Basel', lat: 47.5596, lng: 7.5886 },
  { base: 'https://www.transition-bern.ch', city: 'Bern', lat: 46.9480, lng: 7.4474 },
  { base: 'https://transition-geneve.ch', city: 'Genève', lat: 46.2044, lng: 6.1432 },
]

export const transitionCh: SourceFetcher = {
  name: 'transition-ch',
  async fetch() {
    const all: RawEvent[] = []
    for (const { base, city, lat, lng } of CITIES) {
      try {
        // Try Tribe Events API
        try {
          const apiRes = await fetch(`${base}/wp-json/tribe/events/v1/events?per_page=20`, {
            headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
          })
          if (apiRes.ok) {
            const data = await apiRes.json()
            if (data.events?.length > 0) {
              all.push(...data.events.map((e: any) => {
                const geo = geocodeSwiss(e.venue?.city || e.venue?.venue || '')
                return {
                  source: 'transition-ch', source_id: `tr-ch-${e.id}`,
                  source_url: e.url ?? `${base}/events/`, title: stripHtml(e.title ?? ''),
                  description: stripHtml(e.description ?? '').slice(0, 500),
                  organizer: e.organizer?.[0]?.organizer ?? `Transition ${city}`,
                  location_name: e.venue?.venue ?? e.venue?.city ?? city,
                  lat: parseFloat(e.venue?.geo_lat ?? '0') || geo?.lat || lat,
                  lng: parseFloat(e.venue?.geo_lng ?? '0') || geo?.lng || lng,
                  starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'Siehe Veranstaltung',
                } as RawEvent
              }))
              continue
            }
          }
        } catch {}

        // Fetch HTML pages
        for (const path of ['/events/', '/agenda/']) {
          try {
            const res = await fetch(`${base}${path}`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
              signal: AbortSignal.timeout(10000),
            })
            if (!res.ok) continue
            const html = await res.text()
            const jsonLd = extractJsonLd(html, 'transition-ch')
            if (jsonLd.length > 0) { all.push(...jsonLd); break }
            const events = scrapeHtml(html, `${base}${path}`, city, lat, lng)
            if (events.length > 0) { all.push(...events); break }
          } catch { continue }
        }
      } catch { continue }
    }
    return all
  },
}

function scrapeHtml(html: string, baseUrl: string, city: string, defLat: number, defLng: number): RawEvent[] {
  const events: RawEvent[] = []
  const pat = /<(?:article|div|li)[^>]*class="[^"]*(?:event|veranstaltung|agenda|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
  let m
  while ((m = pat.exec(html)) !== null) {
    const block = m[1]
    const t = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
    if (!t) continue
    const title = stripHtml(t[2]).trim()
    if (!title || title.length < 5) continue
    const geo = geocodeSwiss(block)
    events.push({
      source: 'transition-ch', source_id: `tr-ch-${hashStr(title + city)}`,
      source_url: t[1] ? new URL(t[1], baseUrl).toString() : baseUrl, title,
      description: `Transition ${city} Veranstaltung.`, organizer: 'Transition Schweiz',
      location_name: city, lat: geo?.lat || defLat, lng: geo?.lng || defLng,
      starts_at: extractMultiDate(block), cost: 'Siehe Veranstaltung',
    })
  }
  return events
}
