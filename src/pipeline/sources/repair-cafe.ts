/**
 * Repair Café source fetcher — reverse-engineered map endpoint
 *
 * repaircafe.org loads café locations via a WordPress REST endpoint.
 * The map at repaircafe.org/en/visit/ makes XHR calls to load markers.
 *
 * Discovered endpoints (may change):
 * - /wp-json/rc/v1/locations — returns café locations (sometimes 404)
 * - /wp-admin/admin-ajax.php?action=get_cafes — alternative AJAX endpoint
 * - The map widget itself embeds location data in a <script> tag
 *
 * Strategy: try the API first, then scrape the visit page for embedded JSON.
 */
import type { RawEvent, SourceFetcher } from './types'

export const repairCafe: SourceFetcher = {
  name: 'repair-cafe',

  async fetch({ lat, lng, radiusKm }) {
    // Strategy 1: Try the REST API endpoint
    const apiEvents = await tryRestApi(lat, lng, radiusKm)
    if (apiEvents.length > 0) return apiEvents

    // Strategy 2: Scrape the visit page for embedded location data
    const scraped = await scrapeVisitPage(lat, lng, radiusKm)
    if (scraped.length > 0) return scraped

    // Strategy 3: Try the AJAX endpoint
    const ajaxEvents = await tryAjaxEndpoint(lat, lng, radiusKm)
    return ajaxEvents
  },
}

async function tryRestApi(lat: number, lng: number, radiusKm: number): Promise<RawEvent[]> {
  const latDelta = radiusKm / 111
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180))

  // Try multiple known endpoint patterns
  const endpoints = [
    `https://www.repaircafe.org/wp-json/rc/v1/locations?lat_min=${lat - latDelta}&lat_max=${lat + latDelta}&lng_min=${lng - lngDelta}&lng_max=${lng + lngDelta}`,
    `https://www.repaircafe.org/wp-json/rc/v2/cafes?bounds=${lat - latDelta},${lng - lngDelta},${lat + latDelta},${lng + lngDelta}`,
  ]

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)',
          'Accept': 'application/json',
        },
      })

      if (!res.ok) continue

      const data = await res.json()
      const locations = Array.isArray(data) ? data : (data.locations ?? data.cafes ?? [])

      if (locations.length === 0) continue

      return locations
        .filter((loc: any) => loc.latitude || loc.lat)
        .map((loc: any) => locationToEvent(loc))
    } catch {
      continue
    }
  }

  return []
}

async function scrapeVisitPage(lat: number, lng: number, radiusKm: number): Promise<RawEvent[]> {
  try {
    const res = await fetch('https://www.repaircafe.org/en/visit/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    })

    if (!res.ok) return []

    const html = await res.text()

    // Look for embedded JSON in script tags (common WordPress map pattern)
    // Patterns: window.rcLocations = [...], var cafes = [...], JSON.parse('...')
    const patterns = [
      /window\.rcLocations\s*=\s*(\[[\s\S]*?\]);/,
      /var\s+(?:cafes|locations|markers)\s*=\s*(\[[\s\S]*?\]);/,
      /"locations"\s*:\s*(\[[\s\S]*?\])/,
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (!match?.[1]) continue

      try {
        const locations = JSON.parse(match[1])
        if (!Array.isArray(locations)) continue

        // Filter by distance
        return locations
          .filter((loc: any) => {
            const locLat = parseFloat(loc.latitude ?? loc.lat ?? '0')
            const locLng = parseFloat(loc.longitude ?? loc.lng ?? '0')
            return haversine(lat, lng, locLat, locLng) <= radiusKm
          })
          .map((loc: any) => locationToEvent(loc))
      } catch {
        continue
      }
    }

    return []
  } catch (err) {
    console.warn('[repair-cafe] scrape failed:', (err as Error).message)
    return []
  }
}

async function tryAjaxEndpoint(lat: number, lng: number, radiusKm: number): Promise<RawEvent[]> {
  try {
    const res = await fetch('https://www.repaircafe.org/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)',
      },
      body: `action=get_cafes&lat=${lat}&lng=${lng}&radius=${radiusKm}`,
    })

    if (!res.ok) return []

    const data = await res.json()
    const locations = Array.isArray(data) ? data : (data.data ?? [])

    return locations
      .filter((loc: any) => loc.latitude || loc.lat)
      .map((loc: any) => locationToEvent(loc))
  } catch {
    return []
  }
}

function locationToEvent(loc: any): RawEvent {
  const locLat = parseFloat(loc.latitude ?? loc.lat ?? '0')
  const locLng = parseFloat(loc.longitude ?? loc.lng ?? '0')
  const name = loc.name ?? loc.title ?? 'Repair Café'
  const city = loc.city ?? loc.location ?? ''

  // Repair cafés typically run monthly; approximate next event
  const nextSaturday = new Date()
  nextSaturday.setDate(nextSaturday.getDate() + ((6 - nextSaturday.getDay() + 7) % 7 || 7))
  nextSaturday.setHours(10, 0, 0, 0)

  return {
    source: 'repair-cafe',
    source_id: `rc-${loc.id ?? loc.slug ?? Math.random().toString(36).slice(2, 8)}`,
    source_url: loc.website ?? loc.url ?? 'https://www.repaircafe.org/en/visit/',
    title: `Repair Café — ${name}`,
    description: loc.description ??
      `Community repair event at ${name}${city ? ` in ${city}` : ''}. Bring broken electronics, clothing, bikes, or furniture — volunteer fixers help you repair them for free. Reduce waste and learn repair skills.`,
    organizer: loc.organizer ?? name,
    location_name: [loc.address, city, loc.country].filter(Boolean).join(', ') || name,
    lat: locLat,
    lng: locLng,
    starts_at: loc.next_event ?? nextSaturday.toISOString(),
    cost: 'Free',
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
