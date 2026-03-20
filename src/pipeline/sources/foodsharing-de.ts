/**
 * Foodsharing Deutschland — foodsharing.de
 * Community food saving. Has a documented REST API.
 * API docs: https://beta.foodsharing.de/api/doc/
 */
import type { RawEvent, SourceFetcher } from './types'
import { haversine, hashStr } from './utils'

// Foodsharing API endpoints
const API_BASE = 'https://foodsharing.de/api'

export const foodsharingDe: SourceFetcher = {
  name: 'foodsharing-de',
  async fetch() {
    const events: RawEvent[] = []

    // Strategy 1: Events API
    try {
      const res = await fetch(`${API_BASE}/events`, {
        headers: { 'User-Agent': 'Emerge-App/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : data.events ?? data.data ?? []
        for (const e of items) {
          events.push({
            source: 'foodsharing-de',
            source_id: `fs-evt-${e.id}`,
            source_url: `https://foodsharing.de/events/${e.id}`,
            title: e.name || e.title || 'Foodsharing Event',
            description: (e.description || '').slice(0, 500),
            organizer: e.organizer || 'Foodsharing',
            location_name: e.location?.name || e.address || 'Deutschland',
            lat: parseFloat(e.location?.lat || e.lat || '0'),
            lng: parseFloat(e.location?.lon || e.lng || '0'),
            starts_at: e.start ? new Date(e.start).toISOString() : new Date().toISOString(),
            ends_at: e.end ? new Date(e.end).toISOString() : null,
            cost: 'Free',
          })
        }
        if (events.length > 0) return events
      }
    } catch {}

    // Strategy 2: Community pickups (Fairteiler — public food sharing points)
    try {
      const res = await fetch(`${API_BASE}/fairteiler`, {
        headers: { 'User-Agent': 'Emerge-App/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : data.fairteiler ?? data.data ?? []
        for (const f of items.slice(0, 15)) {
          const fLat = parseFloat(f.lat || f.location?.lat || '0')
          const fLng = parseFloat(f.lon || f.lng || f.location?.lon || '0')

          events.push({
            source: 'foodsharing-de',
            source_id: `fs-ft-${f.id || hashStr(f.name || '')}`,
            source_url: f.id ? `https://foodsharing.de/fairteiler/${f.id}` : 'https://foodsharing.de',
            title: `Fairteiler — ${f.name || 'Food Share Point'}`,
            description: (f.description || '').slice(0, 500) || 'Community food sharing point. Drop off surplus food or pick up rescued food for free.',
            organizer: 'Foodsharing',
            location_name: f.address || f.city || 'Deutschland',
            lat: fLat,
            lng: fLng,
            starts_at: new Date().toISOString(), // ongoing
            cost: 'Free',
          })
        }
      }
    } catch {}

    // Strategy 3: Scrape main page for visible events
    if (events.length === 0) {
      try {
        const res = await fetch('https://foodsharing.de/', {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
          signal: AbortSignal.timeout(10000),
        })
        if (res.ok) {
          const html = await res.text()
          // Foodsharing is a Vue.js SPA — no server-rendered events
          // Check for __INITIAL_STATE__ or similar
          const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/)
          if (stateMatch) {
            try {
              const state = JSON.parse(stateMatch[1])
              // Extract events from Vue store state if present
              const stateEvents = state.events ?? state.activity?.events ?? []
              for (const e of stateEvents.slice(0, 10)) {
                events.push({
                  source: 'foodsharing-de',
                  source_id: `fs-${e.id || hashStr(e.name || '')}`,
                  source_url: `https://foodsharing.de/events/${e.id}`,
                  title: e.name || 'Foodsharing Event',
                  description: (e.description || '').slice(0, 500),
                  organizer: 'Foodsharing',
                  location_name: 'Deutschland',
                  lat: 0, lng: 0,
                  starts_at: new Date().toISOString(),
                  cost: 'Free',
                })
              }
            } catch {}
          }
        }
      } catch {}
    }

    return events
  },
}
