import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { isCreditError, notifyPipelineFailure } from '@/lib/pipeline-monitor'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

let _ai: Anthropic | null = null
function getAI() {
  if (!_ai) _ai = new Anthropic()
  return _ai
}

/** Validate Luma API key and fetch events */
async function fetchLumaEvents(apiKey: string) {
  const res = await fetch('https://api.lu.ma/public/v1/calendar/list-events', {
    headers: {
      'x-luma-api-key': apiKey,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Invalid API key')
    throw new Error(`Luma API error: ${res.status}`)
  }

  const data = await res.json()
  return data.entries ?? data.events ?? []
}

/** Score an event with Haiku */
async function scoreEvent(title: string, description: string, location: string) {
  try {
    const result = await getAI().messages.create({
      model: 'claude-haiku-4-5-20241022',
      max_tokens: 200,
      system: `You are the Emerge curation AI. HARD REJECT FIRST: If the PRIMARY purpose is prayer, mass, sermon, worship, religious instruction, scripture study, proselytising, or religious rite, return {"score":0,"reason":"religious_content","category":"community"}. The cultural OCCASION (Eid, Diwali, Nowruz, Christmas) does NOT make it religious — only the PURPOSE does. Test: if food and gathering were removed, would it still be a religious service? If yes, reject. Score this event 0-100 for alignment with regenerative community practice. Regenerative means: hands-on, local, builds real-world relationships, involves making/growing/repairing/sharing together. NOT talks about sustainability, NOT corporate wellness, NOT purely online. COMMUNAL TABLE BONUS: +20 if communal cooking + eating + seasonal/cultural celebration. +15 if communal cooking + eating. +10 if communal eating from rescued food. +15 DIASPORA BONUS if minority community leads a cultural food celebration (Nowruz, Eid, Diwali, Lunar New Year). Use "feast" category when communal cooking/eating is the primary activity. -10 PASSIVE PENALTY for watching-only events. Return JSON only: {"score":number,"reason":"string","category":"nature|food|craft|community|wellness|learning|feast"}`,
      messages: [{ role: 'user', content: `Event: "${title}"\nDescription: "${description}"\nLocation: "${location}"` }],
    })

    const text = result.content[0].type === 'text' ? result.content[0].text : ''
    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim()
    return JSON.parse(cleaned)
  } catch (err) {
    if (isCreditError(err)) {
      await notifyPipelineFailure('credits_exhausted', { source: 'connect-luma', event: title })
      return null
    }
    throw err
  }
}

export async function POST(request: NextRequest) {
  try {
    const { api_key, user_id } = await request.json()

    if (!api_key || typeof api_key !== 'string') {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    // 1. Validate key by fetching events
    let events: any[]
    try {
      events = await fetchLumaEvents(api_key)
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }

    // 2. Store the connected calendar (encrypt key server-side)
    const calendarName = events[0]?.event?.host?.name ?? 'Luma Organiser'
    const { error: insertError } = await supabase.from('connected_calendars').upsert(
      {
        user_id: user_id ?? null,
        platform: 'luma',
        api_key_encrypted: api_key, // In production, encrypt with a server-side key
        organiser_name: calendarName,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'platform,api_key_encrypted' }
    )

    if (insertError) {
      console.error('[connect-luma] DB error:', insertError.message)
      // Continue anyway — still process events
    }

    // 3. Process upcoming events
    let inserted = 0
    let filtered = 0

    for (const entry of events) {
      const ev = entry.event ?? entry
      if (!ev.name || !ev.start_at) continue
      if (new Date(ev.start_at) < new Date()) continue

      try {
        const location = ev.geo_address_json?.full_address ?? ev.location ?? ''
        const scored = await scoreEvent(ev.name, ev.description ?? '', location)
        if (!scored) continue
        const score = Math.max(0, Math.min(100, Math.round(scored.score)))

        if (score < 50) { filtered++; continue }

        const lat = ev.geo_latitude ?? 0
        const lng = ev.geo_longitude ?? 0

        await supabase.from('quests').upsert(
          {
            title: ev.name,
            description: (ev.description ?? '').slice(0, 500),
            category: scored.category ?? 'community',
            geog: lat !== 0 ? `POINT(${lng} ${lat})` : null,
            address: location || 'See event page',
            starts_at: new Date(ev.start_at).toISOString(),
            ends_at: ev.end_at ? new Date(ev.end_at).toISOString() : null,
            source_url: ev.url ?? `https://lu.ma/${ev.api_id ?? ev.id}`,
            source_name: calendarName,
            ai_score: score,
            ai_reasoning: scored.reason,
            image_url: ev.cover_url ?? null,
            max_participants: ev.guest_limit ?? null,
          },
          { onConflict: 'title,starts_at' }
        )
        inserted++
      } catch {
        // Skip individual event errors
      }
    }

    return NextResponse.json({
      ok: true,
      organiser_name: calendarName,
      events_found: events.length,
      inserted,
      filtered,
    })
  } catch (err) {
    console.error('[connect-luma]', err)
    return NextResponse.json({ error: 'Failed to connect' }, { status: 500 })
  }
}
