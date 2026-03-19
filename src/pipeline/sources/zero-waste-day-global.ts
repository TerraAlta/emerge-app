/** International Zero Waste Day — zerowaste.day — annual global event map March-April */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const URLS = ['https://zerowaste.day/', 'https://www.zerowaste.day/events/', 'https://zerowaste.day/map/']

export const zeroWasteDayGlobal: SourceFetcher = {
  name: 'zero-waste-day-global',
  async fetch() {
    // 1. Try JSON API (some event maps expose GeoJSON or REST endpoints)
    try {
      const r = await fetch('https://zerowaste.day/wp-json/tribe/events/v1/events?per_page=50', {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.events?.length) return d.events.map((e: any) => ({
          source: 'zero-waste-day-global', source_id: `zwday-t${e.id}`,
          source_url: e.url ?? null, title: stripHtml(e.title ?? ''),
          description: stripHtml(e.description ?? '').slice(0, 500),
          organizer: 'International Zero Waste Day',
          location_name: e.venue?.venue ?? 'See event page',
          lat: parseFloat(e.venue?.geo_lat ?? '0'), lng: parseFloat(e.venue?.geo_lng ?? '0'),
          starts_at: new Date(e.start_date).toISOString(), cost: e.cost ?? 'Free',
        }))
      }
    } catch {}
    // 2. Try embedded map data (GeoJSON or JS array)
    for (const url of URLS) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) continue
        const html = await r.text()
        const ld = extractJsonLd(html, 'zero-waste-day-global')
        if (ld.length > 0) return ld
        // Try GeoJSON embedded in page
        const geoMatch = html.match(/(?:features|markers)\s*[:=]\s*(\[[\s\S]*?\])\s*[;,]/i)
        if (geoMatch) {
          try {
            const features = JSON.parse(geoMatch[1])
            const out: RawEvent[] = []
            for (const f of features) {
              const props = f.properties ?? f
              const coords = f.geometry?.coordinates ?? [props.lng ?? 0, props.lat ?? 0]
              out.push({
                source: 'zero-waste-day-global', source_id: `zwday-${hashStr(props.title ?? props.name ?? '')}`,
                source_url: props.url ?? url, title: stripHtml(props.title ?? props.name ?? 'Zero Waste Day Event'),
                description: stripHtml(props.description ?? '').slice(0, 500) || 'International Zero Waste Day event.',
                organizer: props.organizer ?? 'Zero Waste Day', location_name: props.city ?? props.location ?? 'See event',
                lat: coords[1] ?? 0, lng: coords[0] ?? 0,
                starts_at: props.date ? new Date(props.date).toISOString() : new Date().toISOString(), cost: 'Free',
              })
            }
            if (out.length > 0) return out
          } catch {}
        }
        // HTML scrape fallback
        const out: RawEvent[] = []
        const rx = /<(?:article|div|li)[^>]*class="[^"]*(?:event|action|cleanup|zero-waste|tribe)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi
        let m
        while ((m = rx.exec(html)) !== null) {
          const t = m[1].match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
          if (!t) continue
          const title = stripHtml(t[2]).trim()
          if (!title || title.length < 5 || /^(menu|nav|search)/i.test(title)) continue
          out.push({
            source: 'zero-waste-day-global', source_id: `zwday-${hashStr(title)}`,
            source_url: t[1] ? new URL(t[1], url).toString() : url, title,
            description: 'International Zero Waste Day event.',
            organizer: 'Zero Waste Day', location_name: 'See event page',
            lat: 0, lng: 0, starts_at: new Date().toISOString(), cost: 'Free',
          })
        }
        if (out.length > 0) return out
      } catch { continue }
    }
    return []
  },
}
