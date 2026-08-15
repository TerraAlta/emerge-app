'use client'

/**
 * Bridges the Quests curriculum to the live Events feed — the "learning → doing"
 * move. Reads the user's saved location (set by the Events tab) and surfaces
 * real regenerative events near them, themed to the petal. Read-only.
 */

import { supabase } from '@/lib/supabase'

export interface NearbyEventLite {
  id: string
  title: string
  starts_at: string
  distance_km: number
  category: string
  source_name: string | null
  source_url: string | null
}

interface SavedLoc { lat: number; lng: number; name: string }

/** The location the Events tab last saved (no re-prompt). */
export function loadSavedLocation(): SavedLoc | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('emerge-location')
    if (!raw) return null
    const l = JSON.parse(raw)
    if (typeof l?.lat === 'number' && typeof l?.lng === 'number') {
      return { lat: l.lat, lng: l.lng, name: l.name || 'you' }
    }
    return null
  } catch {
    return null
  }
}

// Which Events-feed categories each petal points to.
const PETAL_EVENT_CATEGORIES: Record<string, string[]> = {
  ethics: ['learning', 'community'],
  'land-nature': ['nature', 'food'],
  'building-technology': ['craft'],
  'tools-materials': ['craft', 'make'],
  'finance-economics': ['community', 'learning'],
  'governance-community': ['community'],
  'health-wellbeing': ['wellness', 'community'],
  'education-culture': ['learning', 'community', 'make', 'play'],
}

/** Up to 3 upcoming events near the user that fit this petal's domain. */
export async function fetchNearbyEventsForPetal(
  petalKey: string,
  loc: { lat: number; lng: number },
): Promise<NearbyEventLite[]> {
  const cats = PETAL_EVENT_CATEGORIES[petalKey] ?? []
  const { data, error } = await supabase.rpc('nearby_quests', {
    user_lat: loc.lat,
    user_lng: loc.lng,
    radius_km: 50,
    search_keyword: null,
  })
  if (error || !data) return []
  const rows = data as NearbyEventLite[]
  const filtered = cats.length ? rows.filter(r => cats.includes(r.category)) : rows
  return filtered.slice(0, 3)
}
