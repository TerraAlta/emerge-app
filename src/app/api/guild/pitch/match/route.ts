/**
 * Matching engine for a published pitch.
 *
 * Candidates:
 *  - Verified practitioners: language overlap (with pitch.language) AND
 *    at least one flower_petal overlap. Not 'unavailable'.
 *  - Other published, non-expired pitches: at least one flower_petal overlap.
 *
 * Ranking:
 *  - In-DB pre-score (petal overlap, language match, country match)
 *  - Top ~30 passed to Haiku with "rank these honestly" prompt
 *  - AI returns subset with per-match reasoning + score (0..1)
 *  - Top 10 saved to guild_pitch_matches (UPSERT by UNIQUE constraint)
 *  - Top 5 get a single email notification ("A pitch that might need you")
 *
 * Auth: internal key only. Called by /api/guild/pitch/publish via waitUntil.
 * Cooldown: 7 days per pitch (skipped if match already ran recently).
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { GUILD_MODEL, isDailyLimitReached, logApiUsage } from '@/lib/guild-costs'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'

export const maxDuration = 120

let _ai: Anthropic | null = null
function getAI() {
  if (!_ai) _ai = new Anthropic()
  return _ai
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const SHORTLIST_SIZE = 30
const MAX_MATCHES = 10
const EMAIL_TOP_N = 5
const COOLDOWN_DAYS = 7

const SYSTEM_PROMPT = `You rank candidate matches for a new pitch on Emerge (a regenerative practitioner & project network).

You will receive:
1. The pitch (vision, stage, petals, roles sought, region, language)
2. A candidate shortlist: some practitioners, some other pitches

Return a JSON array ranking ONLY candidates that genuinely fit. Be honest — a weak match scores low; a bad match should not be returned at all. Quality > quantity. 2-10 matches total.

For each match include:
- id: the candidate's id as given
- matched_type: "practitioner" or "pitch"
- score: 0..1 (0.9+ = strong, 0.7-0.9 = good, 0.5-0.7 = plausible, below 0.5 = don't include)
- reasoning: one paragraph (2-3 sentences), grounded in SPECIFIC details. "Overlap in governance" is weak. "Specialises in sociocracy for founding communities, speaks Portuguese, based in Lisbon" is strong.

REFUSE to invent details. If the data doesn't support a strong reasoning, don't include that candidate.

Respond ONLY with valid JSON array — no markdown fencing, no commentary:
[{"id": "uuid", "matched_type": "practitioner|pitch", "score": 0.0, "reasoning": "..."}]`

function overlap(a: any[], b: any[]): number {
  const sb = new Set((b || []).map((x: any) => String(x).toLowerCase()))
  return (a || []).filter((x: any) => sb.has(String(x).toLowerCase())).length
}

export async function POST(request: NextRequest) {
  try {
    // Internal-key auth
    const internalKey = request.headers.get('x-internal-key')
    if (!internalKey || internalKey !== process.env.INTERNAL_TRIGGER_KEY) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
    }

    if (await isDailyLimitReached()) {
      return NextResponse.json({ error: 'Guild AI daily limit reached — matching paused.' }, { status: 503 })
    }

    const { pitchId } = await request.json()
    if (!pitchId) return NextResponse.json({ error: 'Missing pitchId' }, { status: 400 })

    const supabase = getServiceClient()

    const { data: pitch } = await supabase
      .from('guild_pitches')
      .select('*')
      .eq('id', pitchId)
      .single()
    if (!pitch) return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })
    if (pitch.status !== 'published') {
      return NextResponse.json({ error: 'Pitch is not published' }, { status: 400 })
    }

    // Cooldown check: skip if the most recent match row for this pitch is recent
    const { data: recentMatches } = await supabase
      .from('guild_pitch_matches')
      .select('created_at')
      .eq('pitch_id', pitchId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (recentMatches && recentMatches[0]) {
      const last = new Date(recentMatches[0].created_at).getTime()
      if (Date.now() - last < COOLDOWN_DAYS * 86_400_000) {
        return NextResponse.json({ ok: true, skipped: 'cooldown', lastRunAt: recentMatches[0].created_at })
      }
    }

    // --- Candidate pools ---
    const pitchPetals: string[] = pitch.flower_petals || []
    const pitchLang: string = pitch.language || 'en'

    // Practitioners: verified, not unavailable, has language overlap, at least one petal overlap
    const { data: allPractitioners } = await supabase
      .from('guild_practitioners')
      .select('id, display_name, tagline, bio, country, region, languages, flower_petals, specialties, years_experience')
      .eq('verified', true)
      .neq('availability_status', 'unavailable')

    const practCandidates = (allPractitioners || [])
      .map((p: any) => {
        const petalOverlap = overlap(p.flower_petals || [], pitchPetals)
        if (petalOverlap === 0) return null
        const langs = (p.languages || []).map((l: string) => l.toLowerCase())
        const langMatch = langs.includes(pitchLang.toLowerCase()) || langs.some((l: string) => l.startsWith(pitchLang.toLowerCase()))
        if (!langMatch) return null
        const countryMatch = (p.country || '').toLowerCase() === (pitch.country || '').toLowerCase()
        const preScore = petalOverlap * 10 + (countryMatch ? 5 : 0)
        return { ...p, _preScore: preScore, _type: 'practitioner' as const }
      })
      .filter(Boolean)

    // Other pitches: published, non-expired, petal overlap, not self
    const { data: otherPitchesRaw } = await supabase
      .from('guild_pitches')
      .select('id, title, one_line_vision, country, region, language, flower_petals, roles_sought, stage')
      .eq('status', 'published')
      .gt('expires_at', new Date().toISOString())
      .neq('id', pitchId)
    const pitchCandidates = (otherPitchesRaw || [])
      .map((p: any) => {
        const petalOverlap = overlap(p.flower_petals || [], pitchPetals)
        if (petalOverlap === 0) return null
        const preScore = petalOverlap * 8
          + ((p.country || '').toLowerCase() === (pitch.country || '').toLowerCase() ? 4 : 0)
          + ((p.language || '').toLowerCase() === pitchLang.toLowerCase() ? 3 : 0)
        return { ...p, _preScore: preScore, _type: 'pitch' as const }
      })
      .filter(Boolean)

    const shortlist = [...practCandidates as any[], ...pitchCandidates as any[]]
      .sort((a, b) => b._preScore - a._preScore)
      .slice(0, SHORTLIST_SIZE)

    if (shortlist.length === 0) {
      return NextResponse.json({ ok: true, matchCount: 0, note: 'No candidates in shortlist' })
    }

    // --- Haiku ranking ---
    const pitchSummary = {
      id: pitch.id,
      title: pitch.title,
      one_line_vision: pitch.one_line_vision,
      vision_long: (pitch.vision_long || '').slice(0, 800),
      stage: pitch.stage,
      commitment_level: pitch.commitment_level,
      country: pitch.country,
      region: pitch.region,
      flower_petals: pitch.flower_petals,
      roles_sought: pitch.roles_sought,
      offering: (pitch.offering || '').slice(0, 400),
      language: pitch.language,
    }

    const candidatesForAI = shortlist.map((c: any) => {
      if (c._type === 'practitioner') {
        return {
          id: c.id,
          matched_type: 'practitioner',
          display_name: c.display_name,
          tagline: c.tagline,
          bio: (c.bio || '').slice(0, 500),
          country: c.country,
          region: c.region,
          languages: c.languages,
          flower_petals: c.flower_petals,
          specialties: c.specialties,
          years_experience: c.years_experience,
        }
      }
      return {
        id: c.id,
        matched_type: 'pitch',
        title: c.title,
        one_line_vision: c.one_line_vision,
        country: c.country,
        region: c.region,
        language: c.language,
        flower_petals: c.flower_petals,
        roles_sought: c.roles_sought,
        stage: c.stage,
      }
    })

    const userMessage = `PITCH:
${JSON.stringify(pitchSummary, null, 2)}

CANDIDATES (${candidatesForAI.length}):
${JSON.stringify(candidatesForAI, null, 2)}

Return the ranked JSON array.`

    const result = await getAI().messages.create({
      model: GUILD_MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = result.content[0].type === 'text' ? result.content[0].text : '[]'
    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim()
    let matches: any[]
    try {
      matches = JSON.parse(cleaned)
    } catch {
      console.error('[pitch-match] parse fail:', cleaned.slice(0, 300))
      return NextResponse.json({ error: 'Match parse failed' }, { status: 500 })
    }

    // Validate every returned id is actually in the shortlist — defend against hallucinated ids
    const practIds = new Set(practCandidates.map((p: any) => p.id))
    const pitchIds = new Set(pitchCandidates.map((p: any) => p.id))
    const valid = (Array.isArray(matches) ? matches : [])
      .filter(m => {
        if (!m?.id || !m?.matched_type) return false
        if (m.matched_type === 'practitioner') return practIds.has(m.id)
        if (m.matched_type === 'pitch') return pitchIds.has(m.id)
        return false
      })
      .slice(0, MAX_MATCHES)

    // Upsert match rows
    for (const m of valid) {
      await supabase.from('guild_pitch_matches').upsert({
        pitch_id: pitchId,
        matched_type: m.matched_type,
        matched_id: m.id,
        reasoning: String(m.reasoning || '').slice(0, 1000),
        score: Math.max(0, Math.min(1, Number(m.score) || 0)),
      }, { onConflict: 'pitch_id,matched_type,matched_id' })
    }

    await logApiUsage({
      userId: pitch.user_id,
      feature: 'pitch_matching',
      tokensInput: result.usage.input_tokens,
      tokensOutput: result.usage.output_tokens,
    })

    // Send email notifications to top EMAIL_TOP_N matches (respect user preferences)
    const topForEmail = valid.slice(0, EMAIL_TOP_N)
    const appUrl = getAppUrl()
    if (isEmailConfigured()) {
      for (const m of topForEmail) {
        try {
          let recipientUserId: string | null = null
          let name = ''
          if (m.matched_type === 'practitioner') {
            const p = practCandidates.find((x: any) => x.id === m.id) as any
            if (!p) continue
            const { data: row } = await supabase
              .from('guild_practitioners')
              .select('user_id, display_name')
              .eq('id', m.id).single()
            recipientUserId = row?.user_id || null
            name = row?.display_name || p.display_name
          } else {
            const other = pitchCandidates.find((x: any) => x.id === m.id) as any
            if (!other) continue
            const { data: row } = await supabase
              .from('guild_pitches')
              .select('user_id, title')
              .eq('id', m.id).single()
            recipientUserId = row?.user_id || null
            name = row?.title || ''
          }
          if (!recipientUserId) continue

          // Respect digest preference: if they opted out, skip match notifications too
          const { data: prof } = await supabase
            .from('profiles')
            .select('email_digest_enabled, first_name')
            .eq('id', recipientUserId).single()
          if (prof && prof.email_digest_enabled === false) continue

          const { data: authUser } = await supabase.auth.admin.getUserById(recipientUserId)
          const email = authUser?.user?.email
          if (!email) continue

          const subject = m.matched_type === 'practitioner'
            ? `A pitch that might need you: ${pitch.title}`
            : `A pitch that might resonate: ${pitch.title}`
          const greeting = prof?.first_name || 'there'
          const html = `
            <div style="font-family:-apple-system,sans-serif;max-width:560px;padding:24px 20px;color:#1a1a1a;line-height:1.6;">
              <h2 style="font-weight:300;font-size:22px;">Hello ${greeting},</h2>
              <p>Someone published a pitch on the Guild that looked like a possible fit.</p>
              <p style="background:#F7F3ED;padding:16px 18px;border-radius:10px;font-style:italic;">
                <strong>${pitch.title}</strong><br/>
                ${pitch.one_line_vision}
              </p>
              <p style="margin-top:16px;font-size:13px;color:#555;">Why we thought of you: ${String(m.reasoning || '').slice(0, 400)}</p>
              <p style="margin-top:16px;">
                <a href="${appUrl}/guild/pitch/${pitch.id}" style="display:inline-block;background:#C8913A;color:#fff;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:600;">Read the pitch</a>
              </p>
              <p style="font-size:11px;color:#888;margin-top:28px;">
                You're receiving this because you have a verified Guild profile / published pitch whose interests overlap.
                <br/>To stop match emails, turn off the weekly digest in your Emerge settings.
              </p>
            </div>`
          await sendEmail({ to: email, subject, html })
        } catch (e: any) {
          console.warn('[pitch-match] email failed:', e?.message || e)
        }
      }
    }

    return NextResponse.json({ ok: true, matchCount: valid.length })
  } catch (err: any) {
    console.error('[pitch-match]', err)
    return NextResponse.json({ error: err?.message || 'Match failed' }, { status: 500 })
  }
}
