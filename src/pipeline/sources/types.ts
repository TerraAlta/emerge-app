/** Normalized event shape returned by all source fetchers */
export interface RawEvent {
  source: string
  source_id: string
  source_url: string | null
  title: string
  description: string
  organizer: string
  location_name: string
  lat: number
  lng: number
  starts_at: string        // ISO 8601
  ends_at?: string | null
  cost: string             // "Free", "€10", "Membership required", etc.
  image_url?: string | null
  max_participants?: number | null
}

export interface SourceFetcher {
  name: string
  fetch(opts: { lat: number; lng: number; radiusKm: number }): Promise<RawEvent[]>
}
