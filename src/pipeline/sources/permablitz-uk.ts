/**
 * Permablitz London — permablitzlondon.com
 * Community garden transformation days, permaculture workshops and skill-shares
 * around London.
 *
 * (permablitz.net, which this file used to scrape, is Permablitz *Melbourne*.)
 * The London site is Squarespace: its events collection serves JSON at
 * `/permablitzes-events?format=json` with `upcoming[]` items carrying epoch-ms
 * start/end and a location block with coordinates.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'permablitz-uk'
const BASE = 'https://www.permablitzlondon.com'
const COLLECTION_URL = `${BASE}/permablitzes-events?format=json`
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'

// Squarespace stamps this pin (Cecil Sharp House) on events whose organiser
// never moved the map marker, so it is only trusted for Cecil Sharp House itself.
const DEFAULT_PIN = { lat: 51.5381546, lng: -0.1493065 }
const KNOWN_VENUES: Array<[RegExp, number, number]> = [
  [/cecil sharp/i, 51.5382, -0.1493],
  [/kentish town city farm/i, 51.5524, -0.1490],
  [/whittington park/i, 51.5636, -0.1356],
  [/brockwell park/i, 51.4508, -0.1066],
]
const LONDON = { lat: 51.5074, lng: -0.1278 }

function placeFor(loc: any, title: string): { lat: number; lng: number } {
  const text = `${loc?.addressTitle ?? ''} ${loc?.addressLine1 ?? ''} ${title}`
  for (const [rx, lat, lng] of KNOWN_VENUES) if (rx.test(text)) return { lat, lng }
  const lat = Number(loc?.markerLat ?? loc?.mapLat)
  const lng = Number(loc?.markerLng ?? loc?.mapLng)
  const isDefault = Math.abs(lat - DEFAULT_PIN.lat) < 1e-5 && Math.abs(lng - DEFAULT_PIN.lng) < 1e-5
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && !isDefault) return { lat, lng }
  return LONDON
}

/** Squarespace bodies embed <style> blocks and butt block elements together. */
function cleanBody(html: string): string {
  return stripHtml(
    html
      .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|h[1-6]|li|ul|ol)>|<br\s*\/?>/gi, ' '),
  )
}

export const permablitzUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    let data: any
    try {
      const res = await fetch(COLLECTION_URL, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) { console.warn(`[${SRC}] ${res.status}`); return [] }
      data = await res.json()
    } catch (err) {
      console.warn(`[${SRC}] failed:`, (err as Error).message)
      return []
    }

    const items: any[] = Array.isArray(data?.upcoming) ? data.upcoming : []
    const events: RawEvent[] = []
    for (const it of items) {
      const title = stripHtml(String(it?.title ?? ''))
      const start = Number(it?.startDate)
      if (!title || !Number.isFinite(start) || start <= 0) continue
      const end = Number(it?.endDate)

      const loc = it.location ?? {}
      const addrParts = [loc.addressTitle, loc.addressLine1, loc.addressLine2]
        .map((s: unknown) => stripHtml(String(s ?? '')).replace(/[,\s]+$/, ''))
        .filter(Boolean)
      if (/\bonline\b|\bzoom\b/i.test(`${title} ${addrParts.join(' ')}`) && !addrParts.length) continue
      const { lat, lng } = placeFor(loc, title)

      const desc = cleanBody(String(it.excerpt || it.body || '')).slice(0, 500)
      events.push({
        source: SRC,
        source_id: `pb-${it.id ?? hashStr(title + start)}`,
        source_url: it.fullUrl ? new URL(it.fullUrl, BASE).toString() : `${BASE}/permablitzes-events`,
        title,
        description: desc || 'Permablitz London community gardening day — learn permaculture by doing, share food and skills.',
        organizer: 'Permablitz London',
        location_name: addrParts.join(', ') || 'London',
        lat,
        lng,
        // Squarespace adds stray milliseconds to the epoch; round to the minute
        starts_at: new Date(Math.round(start / 60000) * 60000).toISOString(),
        ends_at: Number.isFinite(end) && end > start ? new Date(Math.round(end / 60000) * 60000).toISOString() : null,
        cost: 'See event page',
        image_url: typeof it.assetUrl === 'string' ? it.assetUrl : null,
      })
    }
    return events
  },
}
