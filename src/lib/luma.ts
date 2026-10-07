/**
 * Luma calendar import, shared by /api/connect-luma (on connect) and
 * /api/cron/sync-luma (daily).
 *
 * Cost protection (2026-10-07 audit — both routes used to call Haiku with no
 * cap, and re-scored every off-topic event every day):
 *   - scoring goes through scoreQuest(), so every call hits costTracker and
 *     CostCapExceeded propagates out of the per-event catch;
 *   - at most MAX_EVENTS_PER_CALENDAR upcoming events per pass;
 *   - events already in `quests` (same source_url) are skipped before scoring;
 *   - events scored below threshold are remembered in
 *     connected_calendars.rejected_event_ids and never scored again.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { scoreQuest } from '@/pipeline/score-quest'
import { CostCapExceeded } from '@/pipeline/cost-cap'
import { decrypt, isEncrypted } from '@/lib/crypto'

export const MAX_EVENTS_PER_CALENDAR = 50
const MIN_SCORE = 50
const MAX_REMEMBERED_REJECTIONS = 500

/** Validate a Luma API key and fetch its calendar's events. */
export async function fetchLumaEvents(apiKey: string): Promise<any[]> {
  const res = await fetch('https://api.lu.ma/public/v1/calendar/list-events', {
    headers: { 'x-luma-api-key': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Invalid API key')
    throw new Error(`Luma API error: ${res.status}`)
  }
  const data = await res.json()
  return data.entries ?? data.events ?? []
}

/** The stored key in plaintext (older rows were saved unencrypted). */
export function storedKey(cal: { api_key_encrypted: string }): string {
  return isEncrypted(cal.api_key_encrypted) ? decrypt(cal.api_key_encrypted) : cal.api_key_encrypted
}

function eventId(ev: any): string {
  return String(ev.api_id ?? ev.id ?? ev.url ?? `${ev.name}|${ev.start_at}`)
}

function eventUrl(ev: any): string {
  return ev.url ?? `https://lu.ma/${ev.api_id ?? ev.id}`
}

export interface LumaImportResult { inserted: number; filtered: number; skipped: number; rejectedIds: string[] }

/**
 * Score and store a calendar's upcoming events. `alreadyRejected` is the
 * calendar's remembered rejections; the returned `rejectedIds` is the updated
 * list to save back. Throws CostCapExceeded when the budget runs out.
 */
export async function importLumaEvents(
  supabase: SupabaseClient,
  entries: any[],
  organiserName: string,
  alreadyRejected: string[] = [],
): Promise<LumaImportResult> {
  const rejected = new Set(alreadyRejected)
  const now = new Date()
  let inserted = 0, filtered = 0, skipped = 0

  const upcoming = entries
    .map(e => e.event ?? e)
    .filter(ev => ev.name && ev.start_at && new Date(ev.start_at) >= now)
    .slice(0, MAX_EVENTS_PER_CALENDAR)

  for (const ev of upcoming) {
    const id = eventId(ev)
    if (rejected.has(id)) { skipped++; continue }

    const url = eventUrl(ev)
    const { data: existing } = await supabase.from('quests').select('id').eq('source_url', url).limit(1)
    if (existing?.length) { skipped++; continue }

    try {
      const location = ev.geo_address_json?.full_address ?? ev.location ?? ''
      const scored = await scoreQuest({
        title: String(ev.name).slice(0, 300),
        description: String(ev.description ?? '').slice(0, 1500),
        location,
      } as any)
      if (!scored) continue
      if (scored.ai_score < MIN_SCORE) { filtered++; rejected.add(id); continue }

      const lat = ev.geo_latitude ?? 0
      const lng = ev.geo_longitude ?? 0
      const { error } = await supabase.from('quests').upsert(
        {
          title: ev.name,
          description: String(ev.description ?? '').slice(0, 500),
          category: scored.category ?? 'community',
          geog: lat !== 0 ? `POINT(${lng} ${lat})` : null,
          address: location || 'See event page',
          starts_at: new Date(ev.start_at).toISOString(),
          ends_at: ev.end_at ? new Date(ev.end_at).toISOString() : null,
          source_url: url,
          source_name: organiserName,
          ai_score: scored.ai_score,
          ai_reasoning: scored.ai_reasoning,
          image_url: ev.cover_url ?? null,
          max_participants: ev.guest_limit ?? null,
        },
        // Never overwrite an existing event with the same title + start.
        { onConflict: 'title,starts_at', ignoreDuplicates: true },
      )
      if (!error) inserted++
    } catch (err) {
      // The budget is a hard stop for the whole run, not a per-event error.
      if (err instanceof CostCapExceeded) throw err
    }
  }

  return { inserted, filtered, skipped, rejectedIds: [...rejected].slice(-MAX_REMEMBERED_REJECTIONS) }
}
