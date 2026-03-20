/**
 * iNaturalist source fetcher — REAL API
 * Docs: https://api.inaturalist.org/v1
 *
 * Searches for collection/umbrella projects (bioblitzes, city nature challenges)
 * that have date rules (d1/d2), meaning they are time-bound events, not permanent.
 * Also searches for upcoming observation events via the /observations endpoint
 * filtered by popular event-style projects.
 */
import type { RawEvent, SourceFetcher } from './types'

export const inaturalist: SourceFetcher = {
  name: 'inaturalist',

  async fetch() {
    const events: RawEvent[] = []

    // Strategy 1: Search for collection projects with date bounds
    const projectEvents = await fetchProjects()
    events.push(...projectEvents)

    // Strategy 2: Search for umbrella projects (multi-project bioblitzes)
    const umbrellaEvents = await fetchUmbrellaProjects()
    events.push(...umbrellaEvents)

    return events
  },
}

async function fetchProjects(): Promise<RawEvent[]> {
  const url = new URL('https://api.inaturalist.org/v1/projects')
  url.searchParams.set('type', 'collection')
  url.searchParams.set('per_page', '30')
  url.searchParams.set('order_by', 'created')

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Emerge-App/1.0 (regenerative-quests)' },
    })
    if (!res.ok) {
      console.warn(`[inaturalist] projects API returned ${res.status}`)
      return []
    }

    const data = await res.json()
    const projects = data.results ?? []
    const events: RawEvent[] = []

    for (const p of projects) {
      const rules = p.rule_preferences ?? []
      const d1 = rules.find((r: any) => r.field === 'd1')?.value
      const d2 = rules.find((r: any) => r.field === 'd2')?.value

      // Only include time-bound projects (actual events, not permanent collections)
      if (!d1) continue

      // Skip events that have already ended
      if (d2 && new Date(d2) < new Date()) continue

      const projLat = p.latitude ? parseFloat(p.latitude) : 0
      const projLng = p.longitude ? parseFloat(p.longitude) : 0

      events.push({
        source: 'inaturalist',
        source_id: `inat-proj-${p.id}`,
        source_url: `https://www.inaturalist.org/projects/${p.slug}`,
        title: p.title,
        description: cleanDescription(p.description ?? ''),
        organizer: p.user?.login ?? 'iNaturalist community',
        location_name: p.place?.display_name || p.location || 'See project page',
        lat: projLat,
        lng: projLng,
        starts_at: new Date(d1).toISOString(),
        ends_at: d2 ? new Date(d2).toISOString() : null,
        cost: 'Free',
        image_url: p.header_image_url || p.icon,
      })
    }

    return events
  } catch (err) {
    console.warn('[inaturalist] projects fetch failed:', (err as Error).message)
    return []
  }
}

async function fetchUmbrellaProjects(): Promise<RawEvent[]> {
  const url = new URL('https://api.inaturalist.org/v1/projects')
  url.searchParams.set('type', 'umbrella')
  url.searchParams.set('per_page', '20')
  url.searchParams.set('order_by', 'created')

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Emerge-App/1.0 (regenerative-quests)' },
    })
    if (!res.ok) return []

    const data = await res.json()
    const projects = data.results ?? []
    const events: RawEvent[] = []

    for (const p of projects) {
      // Umbrella projects sometimes have date info in title/description
      // e.g. "City Nature Challenge 2026 — Lisbon"
      const rules = p.rule_preferences ?? []
      const d1 = rules.find((r: any) => r.field === 'd1')?.value
      if (!d1) continue
      if (new Date(d1) < new Date()) continue

      const d2 = rules.find((r: any) => r.field === 'd2')?.value

      events.push({
        source: 'inaturalist',
        source_id: `inat-umbrella-${p.id}`,
        source_url: `https://www.inaturalist.org/projects/${p.slug}`,
        title: p.title,
        description: cleanDescription(p.description ?? ''),
        organizer: p.user?.login ?? 'iNaturalist community',
        location_name: p.place?.display_name || 'Regional',
        lat: p.latitude ? parseFloat(p.latitude) : 0,
        lng: p.longitude ? parseFloat(p.longitude) : 0,
        starts_at: new Date(d1).toISOString(),
        ends_at: d2 ? new Date(d2).toISOString() : null,
        cost: 'Free',
        image_url: p.header_image_url || p.icon,
      })
    }

    return events
  } catch (err) {
    console.warn('[inaturalist] umbrella fetch failed:', (err as Error).message)
    return []
  }
}

/** Strip HTML tags from iNaturalist descriptions */
function cleanDescription(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}
