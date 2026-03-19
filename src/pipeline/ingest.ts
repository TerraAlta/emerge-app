import { createServiceClient } from '@/lib/supabase'
import { scoreQuest } from './score-quest'

interface RawEvent {
  title: string
  description: string
  location: string
  lat: number
  lng: number
  starts_at: string
  ends_at?: string
  source_url?: string
  source_name: string
  image_url?: string
  max_participants?: number
}

/**
 * Ingests raw community events: AI-scores them, then upserts into Supabase.
 * Call this from an API route or cron job.
 */
export async function ingestEvents(events: RawEvent[]) {
  const supabase = createServiceClient()
  const results: { title: string; score: number; ok: boolean }[] = []

  for (const event of events) {
    try {
      const scored = await scoreQuest({
        title: event.title,
        description: event.description,
        location: event.location,
      })

      const { error } = await supabase.from('quests').insert({
        title: event.title,
        description: event.description,
        category: scored.category,
        geog: `POINT(${event.lng} ${event.lat})` as any,
        address: event.location,
        starts_at: event.starts_at,
        ends_at: event.ends_at ?? null,
        source_url: event.source_url ?? null,
        source_name: event.source_name,
        ai_score: scored.ai_score,
        ai_reasoning: scored.ai_reasoning,
        image_url: event.image_url ?? null,
        max_participants: event.max_participants ?? null,
      })

      if (error) throw error
      results.push({ title: event.title, score: scored.ai_score, ok: true })
    } catch (err) {
      console.error(`Failed to ingest "${event.title}":`, err)
      results.push({ title: event.title, score: 0, ok: false })
    }
  }

  return results
}
