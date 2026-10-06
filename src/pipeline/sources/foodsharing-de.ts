/**
 * foodsharing — foodsharing.de (Germany / Austria / Switzerland)
 * Food-rescue community. Local groups publish public events on the
 * foodsharing map: open "Fairteilungen", Schnippel-/cooking evenings,
 * info stands, foodsharing cafés, clothes swaps with rescued-food buffets…
 *
 * Public (no login) API, documented at https://foodsharing.de/api/doc:
 *   GET /api/map/markers/events          → [{id, name, lat, lon}]
 *   GET /api/map/markers/events/{id}     → {id, name, description, startDate, endDate}
 * Dates are UTC ISO strings. Coordinates come from the marker. Region event
 * lists (/api/region/{id}/events) need a login and are NOT used.
 * Internal group meetings (Bezirkstreffen, Teamtreffen, Plenum…) are skipped
 * before fetching details. The Fairteiler (food-sharing shelf) map is a
 * directory of places, not events, and is not emitted.
 * Requests: 1 + ≤ 40 detail calls (sequential) + ≤ 25 reverse geocodes.
 */
import type { RawEvent, SourceFetcher } from './types'

const SRC = 'foodsharing-de'
const API = 'https://foodsharing.de/api/map/markers/events'
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_DETAIL = 40
const MAX_REVERSE = 25

/** Members-only / organisational meetings — not public community events. */
const INTERNAL_RX =
  /bezirkstreffen|teamtreffen|gruppentreffen|orga-?treffen|plenum|vollversammlung|mitgliederversammlung|monatstreffen|monatliches treffen|foodsaver come together|neulingstreffen|einarbeitung|ausweis|botschafter|\bAG\b|\baustausch$|^treffen\b|schulung/i
const ONLINE_RX = /\b(online|webinar|zoom|digital|videokonferenz)\b/i

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Reverse geocoding for a readable place name (cached per ~1 km cell).
// Nominatim first; on 429 (shared IP) pause it and use Photon (komoot, OSM).
const revCache = new Map<string, string | null>()
let lastGeo = 0
let reverseCalls = 0
let nominatimPausedUntil = 0

function join(parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p && String(p).trim()).join(', ')
}

async function placeName(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  if (revCache.has(key)) return revCache.get(key)!
  if (reverseCalls >= MAX_REVERSE) return null
  reverseCalls++
  const wait = lastGeo + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastGeo = Date.now()

  if (Date.now() >= nominatimPausedUntil) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&lat=${lat}&lon=${lng}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'de' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.ok) {
        const d = await res.json()
        const a = d?.address ?? {}
        const town = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county
        const street = a.road ? `${a.road}${a.house_number ? ` ${a.house_number}` : ''}` : null
        const name = join([d?.name && d.name !== a.road ? d.name : null, street, join([a.postcode, town]).replace(', ', ' ')])
        revCache.set(key, name || null)
        return name || null
      }
      if (res.status === 429 || res.status >= 500) nominatimPausedUntil = Date.now() + 5 * 60000
    } catch { /* fall through to Photon */ }
    const w2 = lastGeo + 1100 - Date.now()
    if (w2 > 0) await new Promise((r) => setTimeout(r, w2))
    lastGeo = Date.now()
  }
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lang=de&lat=${lat}&lon=${lng}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      const p = (await res.json())?.features?.[0]?.properties ?? {}
      const street = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : null
      const town = p.city ?? p.town ?? p.village ?? p.district ?? p.county
      const name = join([p.name && p.name !== p.street ? p.name : null, street, join([p.postcode, town]).replace(', ', ' ')])
      revCache.set(key, name || null)
      return name || null
    }
  } catch { /* give up */ }
  return null
}

export const foodsharingDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    let markers = await getJson(API)
    if (!Array.isArray(markers)) {
      await new Promise((r) => setTimeout(r, 5000))
      markers = await getJson(API)
    }
    if (!Array.isArray(markers)) {
      console.warn(`[${SRC}] marker list unavailable`)
      return []
    }

    // Public-looking events with valid coordinates
    const candidates = markers.filter((m: any) => {
      const name = String(m?.name ?? '')
      const lat = Number(m?.lat)
      const lng = Number(m?.lon)
      if (!m?.id || !name || INTERNAL_RX.test(name) || ONLINE_RX.test(name)) return false
      return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
    })

    // Budget: first one occurrence per (name, place), then the remaining repeats
    const firsts: any[] = []
    const repeats: any[] = []
    const groups = new Set<string>()
    for (const m of candidates) {
      const k = `${m.name}|${Number(m.lat).toFixed(3)}|${Number(m.lon).toFixed(3)}`
      if (groups.has(k)) repeats.push(m)
      else { groups.add(k); firsts.push(m) }
    }
    const toFetch = [...firsts, ...repeats].slice(0, MAX_DETAIL)

    const now = Date.now()
    const out: RawEvent[] = []
    for (const m of toFetch) {
      const d = await getJson(`${API}/${m.id}`)
      if (!d) continue
      const start = Date.parse(d.startDate ?? '')
      if (!Number.isFinite(start) || start < now) continue
      const end = Date.parse(d.endDate ?? '')
      const title = String(d.name ?? m.name).trim()
      const desc = String(d.description ?? '').trim()
      if (ONLINE_RX.test(title) || /^\s*(online|digital)/i.test(desc)) continue

      const lat = Number(m.lat)
      const lng = Number(m.lon)
      const place = await placeName(lat, lng)

      out.push({
        source: SRC,
        source_id: `fs-evt-${m.id}`,
        source_url: `https://foodsharing.de/event/${m.id}`,
        title,
        description: (desc || 'Öffentliche Veranstaltung der foodsharing-Community.').slice(0, 1500),
        organizer: 'foodsharing',
        location_name: place ?? 'foodsharing-Veranstaltung (siehe Karte)',
        lat,
        lng,
        starts_at: new Date(start).toISOString(),
        ends_at: Number.isFinite(end) && end > start ? new Date(end).toISOString() : null,
        cost: /\d+\s*(?:€|euro)/i.test(desc) ? 'See event page' : 'Free',
      })
    }
    return out
  },
}
