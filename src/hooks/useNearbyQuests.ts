'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Quest } from '@/types/database'

interface NearbyQuest extends Quest {
  distance_km: number
}

interface UseNearbyQuestsOptions {
  radiusKm?: number | 'national'
  category?: Quest['category'] | null
  searchKeyword?: string | null
}

interface SavedLocation {
  lat: number
  lng: number
  name: string
  source: 'gps' | 'manual'
  countryCode?: string
}

const LOCATION_KEY = 'emerge-location'

function getSavedLocation(): SavedLocation | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LOCATION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (err) {
    console.error('Failed to parse saved location:', err)
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
        ...(loc.countryCode ? { country_code: loc.countryCode } : {}),
      }).eq('id', data.user.id).then(() => {})
    }
  })
}

export function useNearbyQuests(options: UseNearbyQuestsOptions = {}) {
  const { radiusKm = 25, category = null, searchKeyword = null } = options

  const [quests, setQuests] = useState<NearbyQuest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationName, setLocationName] = useState<string>('')
  const [locationDenied, setLocationDenied] = useState(false)
  const [locationLoading, setLocationLoading] = useState(true)
  const [countryCode, setCountryCode] = useState<string>('')

  // Reverse geocode to get city name and country code (Photon/Komoot — no rate limits)
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<{ name: string; countryCode: string }> => {
    try {
      const res = await fetch(
        `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1&lang=en`
      )
      const data = await res.json()
      const p = data?.features?.[0]?.properties
      if (!p) return { name: 'Unknown', countryCode: '' }
      const name = p.city || p.town || p.village || p.locality || p.name || p.county || 'Unknown'
      const countryCode = (p.countrycode || '').toUpperCase()
      return { name, countryCode }
    } catch (err) {
      console.error('Reverse geocode failed:', err)
      return { name: 'Unknown', countryCode: '' }
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
        if (saved.countryCode) setCountryCode(saved.countryCode)
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
        const { name, countryCode: cc } = await reverseGeocode(coords.lat, coords.lng)
        setLocationName(name)
        setCountryCode(cc)
        saveLocation({ ...coords, name, countryCode: cc, source: 'gps' })
        setLocationLoading(false)
      },
      () => {
        // Geolocation denied — use saved location if available, otherwise show search
        if (saved) {
          setLocation({ lat: saved.lat, lng: saved.lng })
          setLocationName(saved.name)
          if (saved.countryCode) setCountryCode(saved.countryCode)
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
    const geo = await reverseGeocode(lat, lng)
    const cityName = name || geo.name
    setLocation({ lat, lng })
    setLocationName(cityName)
    setCountryCode(geo.countryCode)
    setLocationDenied(false)
    saveLocation({ lat, lng, name: cityName, countryCode: geo.countryCode, source: 'manual' })
  }, [reverseGeocode])

  // Fetch quests when location is available
  const fetchQuests = useCallback(async () => {
    if (!location) return

    setLoading(true)
    setError(null)

    let data: any[] | null = null
    let dbError: any = null

    if (radiusKm === 'national' && countryCode) {
      const result = await supabase.rpc('national_quests', {
        user_country: countryCode,
        user_lat: location.lat,
        user_lng: location.lng,
        search_keyword: searchKeyword || null,
      })
      data = result.data
      dbError = result.error
    } else {
      const km = radiusKm === 'national' ? 50 : radiusKm // fallback if no country_code
      const result = await supabase.rpc('nearby_quests', {
        user_lat: location.lat,
        user_lng: location.lng,
        radius_km: km,
        search_keyword: searchKeyword || null,
      })
      data = result.data
      dbError = result.error
    }

    if (dbError) {
      setError(dbError.message)
      setLoading(false)
      return
    }

    let results = (data ?? []) as NearbyQuest[]

    // Fallback: if no quests found nearby, fetch nearest quests globally (up to 500km)
    if (results.length === 0 && radiusKm !== 'national') {
      const fallback = await supabase.rpc('nearby_quests', {
        user_lat: location.lat,
        user_lng: location.lng,
        radius_km: 500,
        search_keyword: null,
      })
      if (fallback.data && fallback.data.length > 0) {
        results = (fallback.data as NearbyQuest[]).slice(0, 20)
      }
    }
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
    } catch (err) {
      // Skills boost is optional — never break the feed
      console.error('Skills boost failed (non-fatal):', err)
    }

    setQuests(results)
    setLoading(false)
  }, [location, radiusKm, category, countryCode, searchKeyword])

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
    countryCode,
    setManualLocation,
    refetch: fetchQuests,
  }
}
