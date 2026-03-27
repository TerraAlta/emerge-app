import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { isCreditError, notifyPipelineFailure } from '@/lib/pipeline-monitor'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

let _ai: Anthropic | null = null
function getAI() {
  if (!_ai) _ai = new Anthropic()
  return _ai
}

async function scoreEvent(title: string, description: string, location: string) {
  try {
    const result = await getAI().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: `You are the Emerge curation AI. HARD REJECT FIRST: If the PRIMARY purpose is prayer, mass, sermon, worship, religious instruction, scripture study, proselytising, or religious rite, return {"score":0,"reason":"religious_content","category":"community"}. The cultural OCCASION (Eid, Diwali, Nowruz, Christmas) does NOT make it religious — only the PURPOSE does. Test: if food and gathering were removed, would it still be a religious service? If yes, reject. NEW AGE HARD REJECT: crystals, astrology, energy healing, chakra, ayahuasca, plant medicine ceremony, guru, tarot, angel healing = score 0 reason new_age_content. Score this event 0-100 for alignment with regenerative community practice. Regenerative means: hands-on, local, builds real-world relationships, involves making/growing/repairing/sharing together. NOT talks about sustainability, NOT corporate wellness, NOT purely online. COMMUNAL TABLE BONUS: +20 if communal cooking + eating + seasonal/cultural celebration. +15 if communal cooking + eating. +10 if communal eating from rescued food. +15 DIASPORA BONUS if minority community leads a cultural food celebration (Nowruz, Eid, Diwali, Lunar New Year). Use "feast" category when communal cooking/eating is the primary activity. Use "play" when participatory music is primary (folk session, drum circle, balfolk, Sacred Harp, community jam). NOT ticketed concerts. Use "make" when ecological/community art-making is primary (open studio, community mural, land art, zine making). NOT commercial galleries. PLAY BONUS: +15 anyone can join, +10 free, +10 folk/traditional. REJECT if ticketed above €20. MAKE BONUS: +20 ecological theme, +15 participatory, +10 community space. REJECT if commercial gallery or ticketed above €15. -10 PASSIVE PENALTY for watching-only events. Return JSON only: {"score":number,"reason":"string","category":"nature|food|craft|community|wellness|learning|feast|play|make"}`,
      messages: [{ role: 'user', content: `Event: "${title}"\nDescription: "${description}"\nLocation: "${location}"` }],
    })

    const text = result.content[0].type === 'text' ? result.content[0].text : ''
    return JSON.parse(text.replace(/```json\s*|```\s*/g, '').trim())
  } catch (err) {
    if (isCreditError(err)) {
      await notifyPipelineFailure('credits_exhausted', { source: 'sync-luma', event: title })
      return null
    }
    throw err
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all connected Luma calendars
  const { data: calendars, error } = await supabase
    .from('connected_calendars')
    .select('*')
    .eq('platform', 'luma')

  if (error || !calendars?.length) {
    return NextResponse.json({ ok: true, message: 'No Luma calendars connected', synced: 0 })
  }

  let totalInserted = 0
  let totalFiltered = 0

  for (const cal of calendars) {
    try {
      const res = await fetch('https://api.lu.ma/public/v1/calendar/list-events', {
        headers: { 'x-luma-api-key': cal.api_key_encrypted, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        console.warn(`[sync-luma] ${cal.organiser_name}: API returned ${res.status}`)
        continue
      }

      const data = await res.json()
      const events = data.entries ?? data.events ?? []

      for (const entry of events) {
        const ev = entry.event ?? entry
        if (!ev.name || !ev.start_at) continue
        if (new Date(ev.start_at) < new Date()) continue

        // Check if already exists
        const { data: existing } = await supabase
          .from('quests')
          .select('id')
          .eq('title', ev.name)
          .eq('starts_at', new Date(ev.start_at).toISOString())
          .limit(1)

        if (existing?.length) continue

        try {
          const location = ev.geo_address_json?.full_address ?? ev.location ?? ''
          const scored = await scoreEvent(ev.name, ev.description ?? '', location)
          if (!scored) continue
          const score = Math.max(0, Math.min(100, Math.round(scored.score)))

          if (score < 50) { totalFiltered++; continue }

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
              source_name: cal.organiser_name,
              ai_score: score,
              ai_reasoning: scored.reason,
              image_url: ev.cover_url ?? null,
              max_participants: ev.guest_limit ?? null,
            },
            { onConflict: 'title,starts_at' }
          )
          totalInserted++
        } catch { /* skip */ }
      }

      // Update last_synced_at
      await supabase
        .from('connected_calendars')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', cal.id)

    } catch (err) {
      console.error(`[sync-luma] ${cal.organiser_name} failed:`, (err as Error).message)
    }
  }

  return NextResponse.json({
    ok: true,
    calendars_synced: calendars.length,
    inserted: totalInserted,
    filtered: totalFiltered,
  })
}
