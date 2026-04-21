/**
 * Guild Scoping Doc Generator — POST-PAYMENT ONLY.
 *
 * Takes a paid project, reads its intake transcript + brief + all verified
 * practitioners, and generates a structured scoping document with matched
 * practitioners. Writes to guild_scoping_docs (unapproved) and moves the
 * project to 'matched' status, which puts it in Pedro's admin review queue.
 *
 * Client NEVER sees the doc until admin approves it (RLS enforced).
 *
 * POST body: { projectId }  (authenticated as admin OR called from Stripe webhook with X-Internal-Key header)
 * Returns:   { ok: true, docId }
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'
import { GUILD_MODEL, calculateCost, isDailyLimitReached, logApiUsage } from '@/lib/guild-costs'
import { FLOWER_PETALS } from '@/lib/flower-petals'

const ADMIN_NOTIFY_EMAIL = process.env.GUILD_ADMIN_EMAIL || 'terraalta.sintra@gmail.com'

let _ai: Anthropic | null = null
function getAI() {
  if (!_ai) _ai = new Anthropic()
  return _ai
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const MAX_PRACTITIONERS_TO_CONSIDER = 30

const SYSTEM_PROMPT = `You are the Guild scoping doc author for Emerge, a regenerative practitioner network grounded in the permaculture flower and these principles:

- Physical presence and real community over online extraction
- Free-for-users, never any paid placement — no practitioner pays to rank
- Hard reject: religious imposition, new-age pseudoscience, corporate wellness
- Multilingual work is the norm
- Human judgment stays in the loop — AI drafts, humans decide

You are writing a scoping document that will be delivered to a paying client who wants to develop a regenerative project. The doc must be warm, specific, practical, and grounded. It must not overpromise. It must not invent facts not present in the intake.

You will receive:
(A) a project brief extracted from a client intake conversation
(B) a shortlist of verified practitioners from the Guild, each with bio, petals, specialties, regions, languages

Your job is to produce a structured scoping document as JSON:

{
  "title": "a warm, specific title for this scoping — max 90 chars",
  "executive_summary": "2-3 paragraphs summarising what this project is, where it is, what it wants to become, and the high-level regenerative approach you suggest (plain language, third person, no jargon-heavy)",
  "site_reading": "2-3 paragraphs reading the land and context — climate, scale, constraints, what's present, what's possible. Be honest about what you can and cannot say from an intake alone",
  "design_principles": ["array of 4-7 concrete regenerative design principles that apply to this specific project — not generic platitudes, specific to their site and vision"],
  "suggested_phases": [
    {
      "phase_name": "e.g. Observation & baseline (Months 0-3)",
      "objectives": ["array of what this phase achieves"],
      "key_activities": ["array of concrete activities"],
      "practitioner_roles": ["which petals or kinds of practitioners are useful in this phase"]
    }
  ],
  "practitioner_recommendations": [
    {
      "practitioner_id": "the uuid of the practitioner from the shortlist",
      "why_this_match": "2-3 sentences explaining why this person fits this project specifically — referencing their bio and the client's needs. Be honest. Never invent details about them.",
      "suggested_role": "what role you suggest they play — e.g. 'lead designer for the water strategy', 'facilitator for the founding circle'",
      "phase": "which phase(s) above they belong to"
    }
  ],
  "risks_and_open_questions": ["array of things that were not clear from the intake and should be explored further before committing"],
  "closing_note": "one warm, grounded paragraph thanking the client and framing this doc as an opening, not a prescription"
}

RULES:
- Recommend only practitioners from the provided shortlist. Never invent a practitioner.
- If the shortlist has no good fit for part of the project, SAY SO in risks_and_open_questions.
- Recommend between 2 and 6 practitioners total. Quality over quantity.
- Do not mention money, rates, or fees anywhere in the document.
- Do not promise outcomes. Frame as suggestions, not guarantees.
- Never recommend anything that contradicts the soul principles (no crystals, no ayahuasca, no corporate wellness, no religious imposition).
- Return ONLY valid JSON, no markdown fencing, no explanation.`

function petalLabel(key: string): string {
  return FLOWER_PETALS.find(p => p.key === key)?.label || key
}

export async function POST(request: NextRequest) {
  try {
    // Internal auth: either admin-authed client OR the Stripe webhook passes INTERNAL_TRIGGER_KEY
    const internalKey = request.headers.get('x-internal-key')
    const isInternal = internalKey && internalKey === process.env.INTERNAL_TRIGGER_KEY

    if (!isInternal) {
      // Fall back to admin check (future-proofing: admin can manually re-generate)
      return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
    }

    if (await isDailyLimitReached()) {
      return NextResponse.json(
        { error: 'Guild AI daily limit reached. Project left in scoping state — will retry tomorrow.' },
        { status: 503 }
      )
    }

    const { projectId } = await request.json()
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

    const supabase = getServiceClient()

    // Load project
    const { data: project, error: projectErr } = await supabase
      .from('guild_projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projectErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.paid) {
      return NextResponse.json({ error: 'Project is not paid' }, { status: 402 })
    }

    const brief = project.extracted_brief || {}
    const transcript = project.intake_transcript || []

    if (!transcript.length || !brief || Object.keys(brief).length === 0) {
      return NextResponse.json({ error: 'Project intake is incomplete' }, { status: 400 })
    }

    // Mark project as generating scoping
    await supabase
      .from('guild_projects')
      .update({ status: 'scoping', updated_at: new Date().toISOString() })
      .eq('id', projectId)

    // Build practitioner shortlist from verified pool, ranked by petal overlap + country + language match
    const { data: allPractitioners } = await supabase
      .from('guild_practitioners')
      .select('id, display_name, tagline, bio, country, region, languages, flower_petals, specialties, climate_zones_worked, project_scales, years_experience, pdc_certified')
      .eq('verified', true)
      .neq('availability_status', 'unavailable')

    const practitioners = allPractitioners || []
    const suggestedPetals: string[] = Array.isArray(brief.suggested_petals) ? brief.suggested_petals : []
    const clientLanguages: string[] = Array.isArray(brief.languages) ? brief.languages : []
    const clientCountry: string = typeof brief.country === 'string' ? brief.country : ''

    function score(p: any): number {
      let s = 0
      const petals: string[] = p.flower_petals || []
      const langs: string[] = p.languages || []
      // Petal overlap (strongest signal)
      s += petals.filter(x => suggestedPetals.includes(x)).length * 10
      // Language overlap
      s += langs.filter(l => clientLanguages.some(cl => cl.toLowerCase() === l.toLowerCase())).length * 3
      // Same country bonus
      if (clientCountry && p.country && p.country.toLowerCase() === clientCountry.toLowerCase()) s += 5
      return s
    }

    const shortlist = practitioners
      .map(p => ({ p, s: score(p) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_PRACTITIONERS_TO_CONSIDER)
      .map(x => x.p)

    // Build the user message for the AI
    const briefSummary = {
      project_name: brief.project_name,
      tagline: brief.tagline,
      country: brief.country,
      region: brief.region,
      land_size_ha: brief.land_size_ha,
      climate_zone: brief.climate_zone,
      project_scale: brief.project_scale,
      project_type: brief.project_type,
      site_context: brief.site_context,
      vision: brief.vision,
      story_fragment: brief.story_fragment,
      stakeholders: brief.stakeholders,
      timeline: brief.timeline,
      constraints: brief.constraints,
      values: brief.values,
      help_sought: brief.help_sought,
      suggested_petals: (brief.suggested_petals || []).map((k: string) => `${k} (${petalLabel(k)})`),
      languages: brief.languages,
    }

    const practitionerList = shortlist.map(p => ({
      practitioner_id: p.id,
      display_name: p.display_name,
      tagline: p.tagline,
      bio: (p.bio || '').slice(0, 1200),
      country: p.country,
      region: p.region,
      languages: p.languages,
      petals: (p.flower_petals || []).map(petalLabel),
      petal_keys: p.flower_petals,
      specialties: p.specialties,
      climate_zones_worked: p.climate_zones_worked,
      project_scales: p.project_scales,
      years_experience: p.years_experience,
      pdc_certified: p.pdc_certified,
    }))

    const userMessage = `(A) PROJECT BRIEF:
${JSON.stringify(briefSummary, null, 2)}

(B) VERIFIED PRACTITIONER SHORTLIST (${practitionerList.length} people):
${JSON.stringify(practitionerList, null, 2)}

Please generate the scoping document as JSON following the schema you were given.`

    const result = await getAI().messages.create({
      model: GUILD_MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = result.content[0].type === 'text' ? result.content[0].text : '{}'
    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim()

    let docContent: any
    try {
      docContent = JSON.parse(cleaned)
    } catch {
      console.error('[guild-scoping] parse fail. stop_reason=', result.stop_reason, 'len=', cleaned.length, 'tail:', cleaned.slice(-400))
      // Leave project in 'scoping' — Pedro can re-trigger manually
      return NextResponse.json({ error: 'Scoping generation parse failed', stop_reason: result.stop_reason }, { status: 500 })
    }

    // Validate practitioner_ids are real
    const shortlistIds = new Set(shortlist.map(p => p.id))
    const recs = Array.isArray(docContent.practitioner_recommendations) ? docContent.practitioner_recommendations : []
    const validRecs = recs.filter((r: any) => r?.practitioner_id && shortlistIds.has(r.practitioner_id))
    docContent.practitioner_recommendations = validRecs
    const matchedIds = validRecs.map((r: any) => r.practitioner_id)

    const tokensInput = result.usage.input_tokens
    const tokensOutput = result.usage.output_tokens
    const costUsd = calculateCost(tokensInput, tokensOutput)

    // Insert scoping doc (unapproved — invisible to client until admin approves)
    const { data: doc, error: docErr } = await supabase
      .from('guild_scoping_docs')
      .insert({
        project_id: projectId,
        doc_content: docContent,
        matched_practitioner_ids: matchedIds,
        matching_reasoning: validRecs.reduce((acc: any, r: any) => {
          acc[r.practitioner_id] = { why: r.why_this_match, role: r.suggested_role, phase: r.phase }
          return acc
        }, {}),
        model_used: GUILD_MODEL,
        tokens_used: tokensInput + tokensOutput,
        cost_usd: costUsd,
      })
      .select()
      .single()

    if (docErr) {
      console.error('[guild-scoping] insert fail:', docErr)
      return NextResponse.json({ error: 'Failed to save scoping doc' }, { status: 500 })
    }

    // Project → 'matched' (= pending admin review)
    await supabase
      .from('guild_projects')
      .update({ status: 'matched', updated_at: new Date().toISOString() })
      .eq('id', projectId)

    // Log AI usage
    await logApiUsage({
      userId: project.client_user_id,
      feature: 'scoping',
      tokensInput,
      tokensOutput,
    })

    // Notify admin a new doc is pending review
    try {
      if (isEmailConfigured()) {
        const appUrl = getAppUrl()
        await sendEmail({
          to: ADMIN_NOTIFY_EMAIL,
          subject: `[Guild] New scoping doc pending review — ${project.project_name || 'project'}`,
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 560px; padding: 24px; line-height: 1.6;">
              <h2 style="font-weight: 300;">New scoping doc ready to review</h2>
              <p><strong>${project.project_name || '(unnamed)'}</strong> · ${brief.country || '?'}</p>
              <p>${brief.tagline || ''}</p>
              <p><a href="${appUrl}/admin/guild" style="display:inline-block;background:#C8913A;color:white;padding:10px 20px;border-radius:999px;text-decoration:none;">Open review queue</a></p>
            </div>
          `,
        })
      }
    } catch (e) {
      console.error('[guild-scoping] admin notify failed:', e)
    }

    return NextResponse.json({ ok: true, docId: doc.id })
  } catch (err) {
    console.error('[guild-generate-scoping]', err)
    return NextResponse.json({ error: 'Scoping generation failed' }, { status: 500 })
  }
}
