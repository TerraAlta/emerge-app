import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/request-user'
import { createClient } from '@supabase/supabase-js'
import { encrypt } from '@/lib/crypto'
import { costTracker, CostCapExceeded, DAILY_CRON_CAP_USD } from '@/pipeline/cost-cap'
import { fetchLumaEvents, importLumaEvents, storedKey } from '@/lib/luma'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // The calendar belongs to the signed-in user — never a user_id from the body.
    const user_id = await getRequestUserId(request)
    if (!user_id) {
      return NextResponse.json({ error: 'Please sign in to connect a calendar' }, { status: 401 })
    }
    const { api_key } = await request.json()

    if (!api_key || typeof api_key !== 'string' || api_key.length > 200) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    // 1. Validate key by fetching events
    let events: any[]
    try {
      events = await fetchLumaEvents(api_key)
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }

    // 2. Store the calendar once. The key is encrypted with a random IV, so the
    //    ciphertext differs every time and can't be the uniqueness check —
    //    compare decrypted keys instead (a user has at most a handful).
    const calendarName = events[0]?.event?.host?.name ?? 'Luma Organiser'
    const { data: mine } = await supabase
      .from('connected_calendars')
      .select('id, api_key_encrypted, rejected_event_ids')
      .eq('platform', 'luma')
      .eq('user_id', user_id)
    const existing = (mine ?? []).find(c => { try { return storedKey(c) === api_key } catch { return false } })

    let calendarId = existing?.id as string | undefined
    if (existing) {
      await supabase.from('connected_calendars')
        .update({ organiser_name: calendarName, last_synced_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      const { data: row, error: insertError } = await supabase.from('connected_calendars').insert({
        user_id,
        platform: 'luma',
        api_key_encrypted: encrypt(api_key),
        organiser_name: calendarName,
        last_synced_at: new Date().toISOString(),
      }).select('id').single()
      if (insertError) console.error('[connect-luma] DB error:', insertError.message)
      calendarId = row?.id
    }

    // 3. Score + store upcoming events, within the daily AI budget.
    costTracker.reset(DAILY_CRON_CAP_USD)
    let result
    try {
      result = await importLumaEvents(supabase, events, calendarName, existing?.rejected_event_ids ?? [])
    } catch (err) {
      if (!(err instanceof CostCapExceeded)) throw err
      console.warn(`[connect-luma] ${err.message}`)
      return NextResponse.json({
        ok: true, organiser_name: calendarName, events_found: events.length,
        inserted: 0, filtered: 0, note: 'Connected — your events will be imported in the next daily sync.',
      })
    }
    if (calendarId) {
      await supabase.from('connected_calendars').update({ rejected_event_ids: result.rejectedIds }).eq('id', calendarId)
    }

    return NextResponse.json({
      ok: true,
      organiser_name: calendarName,
      events_found: events.length,
      inserted: result.inserted,
      filtered: result.filtered,
    })
  } catch (err) {
    console.error('[connect-luma]', err)
    return NextResponse.json({ error: 'Failed to connect' }, { status: 500 })
  }
}
