'use client'

/**
 * Bridges the Quests curriculum to the Guild — after learning a domain, meet
 * the verified practitioners who actually do it. The Guild's `flower_petals`
 * keys match the quest petal keys, so the mapping is direct. Read-only.
 */

import { supabase } from '@/lib/supabase'

export interface PractitionerLite {
  display_name: string
  bio: string | null
  country: string | null
  region: string | null
  profile_photo_url: string | null
}

/** Up to 3 available, verified practitioners who work in this petal's domain. */
export async function fetchPractitionersForPetal(petalKey: string): Promise<PractitionerLite[]> {
  const { data, error } = await supabase
    .from('guild_practitioners')
    .select('display_name, bio, country, region, profile_photo_url')
    .eq('verified', true)
    .contains('flower_petals', [petalKey])
    .neq('availability_status', 'unavailable')
    .limit(3)
  if (error || !data) return []
  return data as PractitionerLite[]
}
