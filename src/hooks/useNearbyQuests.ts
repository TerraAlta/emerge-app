'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Quest } from '@/types/database'

interface NearbyQuest extends Quest {
  distance_km: number
}

interface UseNearbyQuestsOptions {
  radiusKm?: number
  category?: Quest['category'] | null
}

interface SavedLocation {
  lat: number
  lng: number
  name: string
  source: 'gps' | 'manual'
}

const LOCATION_KEY = 'emerge-location'

function getSavedLocation(): SavedLocation | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LOCATION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveLocation(loc: SavedLocation) {
  localStorage.setItem(LOCATION_KEY, JSON.stringify(loc))
  // Sync to profiles for digest emails (fire-and-forget)
  supabase.auth.getUser().then(({ data }) => {
    if (data?.user?.id) {
      supabase.from('profiles').update({
        saved_lat: loc.lat, saved_lng: loc.lng, saved_city: loc.name,
      }).eq('id', data.user.id).then(() => {})
    }
  })
}

export function useNearbyQuests(options: UseNearbyQuestsOptions = {}) {
  const { radiusKm = 25, category = null } = options

  const [quests, setQuests] = useState<NearbyQuest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationName, setLocationName] = useState<string>('')
  const [locationDenied, setLocationDenied] = useState(false)
  const [locationLoading, setLocationLoading] = useState(true)

  // Reverse geocode to get city name
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const data = await res.json()
      const addr = data.address
      return addr?.city || addr?.town || addr?.village || addr?.municipality || addr?.county || 'Unknown'
    } catch {
      return 'Unknown'
    }
  }, [])

  // Get user location on mount
  useEffect(() => {
    const saved = getSavedLocation()

    if (!navigator.geolocation) {
      // No geolocation API — use saved or show denied
      if (saved) {
        setLocation({ lat: saved.lat, lng: saved.lng })
        setLocationName(saved.name)
        setLocationLoading(false)
      } else {
        setLocationDenied(true)
        setLocationLoading(false)
        setLoading(false)
      }
      return
    }

    // Always try geolocation first
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setLocation(coords)
        const name = await reverseGeocode(coords.lat, coords.lng)
        setLocationName(name)
        saveLocation({ ...coords, name, source: 'gps' })
        setLocationLoading(false)
      },
      () => {
        // Geolocation denied — use saved location if available, otherwise show search
        if (saved) {
          setLocation({ lat: saved.lat, lng: saved.lng })
          setLocationName(saved.name)
          setLocationLoading(false)
        } else {
          setLocationDenied(true)
          setLocationLoading(false)
          setLoading(false)
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [reverseGeocode])

  // Manual location setter (from city search)
  const setManualLocation = useCallback(async (lat: number, lng: number, name?: string) => {
    const cityName = name || await reverseGeocode(lat, lng)
    setLocation({ lat, lng })
    setLocationName(cityName)
    setLocationDenied(false)
    saveLocation({ lat, lng, name: cityName, source: 'manual' })
  }, [reverseGeocode])

  // Fetch quests when location is available
  const fetchQuests = useCallback(async () => {
    if (!location) return

    setLoading(true)
    setError(null)

    const { data, error: dbError } = await supabase
      .rpc('nearby_quests', {
        user_lat: location.lat,
        user_lng: location.lng,
        radius_km: radiusKm,
      })

    if (dbError) {
      setError(dbError.message)
      setLoading(false)
      return
    }

    let results = (data ?? []) as NearbyQuest[]
    if (category) {
      results = results.filter((q) => q.category === category)
    }

    // Soft-sort: boost quests matching user's "want to learn" skills
    // Fetch user skills_want and apply a small priority boost
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (userData?.user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('skills_want')
          .eq('id', userData.user.id)
          .single()
        if (profile?.skills_want && Array.isArray(profile.skills_want) && profile.skills_want.length > 0) {
          // Build a set of quest categories the user wants to learn
          const wantCategories = new Set<string>()
          const SKILL_QUEST_MAP: Record<string, string[]> = {
            'grow': ['nature', 'food'], 'forage': ['nature', 'food'], 'compost': ['nature'],
            'seed-save': ['nature', 'food'], 'rewild': ['nature'], 'prune': ['nature'],
            'graft': ['nature'], 'beekeep': ['nature', 'food'], 'agroforest': ['nature'],
            'natural-build': ['craft'], 'cob-adobe': ['craft'], 'straw-bale': ['craft'],
            'timber-frame': ['craft'], 'design': ['craft', 'learning'], 'earthworks': ['craft', 'nature'],
            'repair': ['craft'], 'make-things': ['craft'], 'sew-mend': ['craft'],
            'bike-fix': ['craft'], 'electronics': ['craft'], 'energy': ['craft'],
            'cook': ['food', 'community', 'feast'], 'ferment': ['food'], 'brew-press': ['food'],
            'bake-bread': ['food'], 'preserve': ['food'], 'wild-food': ['food', 'nature'],
            'sing': ['community', 'play'], 'drum': ['community', 'play'],
            'facilitate': ['community', 'learning'], 'theatre': ['community', 'play'],
            'dance': ['community', 'wellness', 'play'], 'craft-art': ['craft', 'make'],
            'weave': ['craft', 'make'], 'draw': ['community', 'make'],
            'cook-many': ['food', 'community', 'feast'],
          }
          for (const sk of profile.skills_want) {
            const cats = SKILL_QUEST_MAP[sk as string]
            if (cats) cats.forEach(c => wantCategories.add(c))
          }
          // Stable soft-sort: matching quests float up, everything else stays in place
          if (wantCategories.size > 0) {
            results.sort((a, b) => {
              const aMatch = wantCategories.has(a.category) ? 1 : 0
              const bMatch = wantCategories.has(b.category) ? 1 : 0
              return bMatch - aMatch // matching quests first, rest unchanged
            })
          }
        }
      }
    } catch {
      // Skills boost is optional — never break the feed
    }

    setQuests(results)
    setLoading(false)
  }, [location, radiusKm, category])

  useEffect(() => {
    fetchQuests()
  }, [fetchQuests])

  // Realtime subscription for new quests
  useEffect(() => {
    const channel = supabase
      .channel('quests-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quests' }, () => {
        fetchQuests()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchQuests])

  return {
    quests,
    loading,
    error,
    location,
    locationName,
    locationDenied,
    locationLoading,
    setManualLocation,
    refetch: fetchQuests,
  }
}
