export interface Quest {
  id: string
  title: string
  description: string
  category: 'nature' | 'food' | 'craft' | 'community' | 'wellness' | 'learning'
  address: string
  starts_at: string
  ends_at: string | null
  source_url: string | null
  source_name: string
  ai_score: number         // 0-100 regenerative alignment score
  ai_reasoning: string
  image_url: string | null
  max_participants: number | null
  created_at: string
  updated_at: string
  lat: number
  lng: number
}

export interface Database {
  public: {
    Tables: {
      quests: {
        Row: Quest
        Insert: Omit<Quest, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Quest, 'id'>>
      }
    }
    Functions: {
      nearby_quests: {
        Args: { user_lat: number; user_lng: number; radius_km: number }
        Returns: (Quest & { distance_km: number })[]
      }
    }
  }
}
