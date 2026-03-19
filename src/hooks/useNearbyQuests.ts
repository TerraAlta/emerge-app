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

export function useNearbyQuests(options: UseNearbyQuestsOptions = {}) {
  const { radiusKm = 25, category = null } = options

  const [quests, setQuests] = useState<NearbyQuest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)

  // Get user location
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported')
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // Fallback to Lisbon when location is denied
        setLocation({ lat: 38.7169, lng: -9.1393 })
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

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

  return { quests, loading, error, location, refetch: fetchQuests }
}
