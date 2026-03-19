/**
 * Repair Café Nederland — repaircafe.org/nl
 * Netherlands has 300+ repair cafés.
 * Uses the same repaircafe.org infrastructure but with NL locale.
 */
import type { RawEvent, SourceFetcher } from './types'
import { haversine, hashStr } from './utils'
import { geocodeDutchCity } from './dutch-utils'

// Netherlands bounding box
const NL_BOUNDS = { latMin: 50.75, latMax: 53.47, lngMin: 3.37, lngMax: 7.21 }

export const repaircafeNl: SourceFetcher = {
  name: 'repaircafe-nl',
  async fetch({ lat, lng, radiusKm }) {
    // Try multiple API endpoints
    const endpoints = [
      `https://www.repaircafe.org/wp-json/rc/v1/locations?lat_min=${NL_BOUNDS.latMin}&lat_max=${NL_BOUNDS.latMax}&lng_min=${NL_BOUNDS.lngMin}&lng_max=${NL_BOUNDS.lngMax}`,
      `https://www.repaircafe.org/wp-json/rc/v2/cafes?country=NL`,
      `https://www.repaircafe.org/wp-admin/admin-ajax.php`,
    ]

    // Strategy 1: REST API
    for (const url of endpoints.slice(0, 2)) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const data = await res.json()
        const locations = Array.isArray(data) ? data : data.locations ?? data.cafes ?? []
        if (locations.length === 0) continue

        return locations
          .filter((loc: any) => {
            const locLat = parseFloat(loc.latitude ?? loc.lat ?? '0')
            const locLng = parseFloat(loc.longitude ?? loc.lng ?? '0')
            return locLat && locLng && haversine(lat, lng, locLat, locLng) <= radiusKm
          })
          .slice(0, 20)
          .map((loc: any) => toEvent(loc))
      } catch { continue }
    }

    // Strategy 2: AJAX endpoint
    try {
      const res = await fetch(endpoints[2], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
        body: `action=get_cafes&country=NL&lat=${lat}&lng=${lng}&radius=${radiusKm}`,
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        const locs = Array.isArray(data) ? data : data.data ?? []
        if (locs.length > 0) return locs.slice(0, 20).map((l: any) => toEvent(l))
      }
    } catch {}

    // Strategy 3: Scrape the NL visit page for embedded data
    try {
      const res = await fetch('https://www.repaircafe.org/nl/bezoek/', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const html = await res.text()
        const patterns = [
          /var\s+(?:locations|cafes|markers)\s*=\s*(\[[\s\S]*?\]);/,
          /"locations"\s*:\s*(\[[\s\S]*?\])/,
        ]
        for (const pattern of patterns) {
          const match = html.match(pattern)
          if (!match?.[1]) continue
          try {
            const locs = JSON.parse(match[1])
            if (!Array.isArray(locs)) continue
            return locs
              .filter((l: any) => {
                const lLat = parseFloat(l.latitude ?? l.lat ?? '0')
                const lLng = parseFloat(l.longitude ?? l.lng ?? '0')
                return lLat && lLng && haversine(lat, lng, lLat, lLng) <= radiusKm
              })
              .slice(0, 20)
              .map((l: any) => toEvent(l))
          } catch { continue }
        }
      }
    } catch {}

    return []
  },
}

function toEvent(loc: any): RawEvent {
  const locLat = parseFloat(loc.latitude ?? loc.lat ?? '0')
  const locLng = parseFloat(loc.longitude ?? loc.lng ?? '0')
  const name = loc.name ?? loc.title ?? 'Repair Café'
  const city = loc.city ?? loc.plaats ?? ''

  const nextSat = new Date()
  nextSat.setDate(nextSat.getDate() + ((6 - nextSat.getDay() + 7) % 7 || 7))
  nextSat.setHours(10, 0, 0, 0)

  return {
    source: 'repaircafe-nl',
    source_id: `rcnl-${loc.id ?? hashStr(name + city)}`,
    source_url: loc.website ?? loc.url ?? 'https://www.repaircafe.org/nl/bezoek/',
    title: `Repair Café ${name}`,
    description: `Repair Café in ${city || name}. Breng kapotte spullen mee — vrijwilligers helpen je gratis met repareren. Elektronica, kleding, fietsen, meubels.`,
    organizer: loc.organizer ?? name,
    location_name: [loc.address, city].filter(Boolean).join(', ') || name,
    lat: locLat || geocodeDutchCity(city)?.lat || 0,
    lng: locLng || geocodeDutchCity(city)?.lng || 0,
    starts_at: loc.next_event ?? nextSat.toISOString(),
    cost: 'Gratis',
  }
}
