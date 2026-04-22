/**
 * Extract structured pitch data from an interview transcript.
 * POST body: { userId, pitchId, transcript, prep_context_text?: string }
 * Returns:   { pitch: StructuredPitch }
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { GUILD_MODEL, MAX_EXTRACTION_TOKENS, isDailyLimitReached, logApiUsage } from '@/lib/guild-costs'

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

const PETALS = [
  'land-nature', 'building-technology', 'tools-materials',
  'health-wellbeing', 'education-culture', 'finance-economics', 'governance-community',
]

const SYSTEM_PROMPT = `You extract a structured pitch JSON from an interview transcript.

Read the ENTIRE transcript (and the optional prep context from URLs the pitcher shared earlier) and return a single JSON object with these fields. Use the pitcher's language for text fields. Leave fields blank if truly unknown — do not invent.

{
  "title": "a short, specific project title (max 80 chars)",
  "one_line_vision": "the one sentence, specific enough that some people would read it and say 'not for me' (max 200 chars)",
  "vision_long": "2-4 paragraphs expanding the vision in the pitcher's words (max 2000 chars)",
  "stage": "idea | gathering_people | has_core_group | seeking_land | has_land",
  "commitment_level": "exploratory | part_time | full_time | lifetime",
  "country": "country name in English (e.g. Portugal, Spain)",
  "region": "city or region (e.g. Alentejo, Catalonia). Empty if project is location-open.",
  "target_region_flexibility": "free text describing geographic flexibility (e.g. 'anywhere in Iberia', 'specific to Sintra area')",
  "flower_petals": ["subset of: land-nature, building-technology, tools-materials, health-wellbeing, education-culture, finance-economics, governance-community"],
  "roles_sought": ["short phrases — e.g. 'water designer', 'sociocracy facilitator', 'co-founder with capital'"],
  "offering": "what the founder brings — skills, capital range, land, time, network, experience (2-3 sentences)",
  "seed_capital_range": "e.g. '€15-25k pooled' — empty if not shared",
  "language": "ISO 639-1 code of the pitch language (en, pt, es, fr, de, it, etc.)",
  "contact_method": "email | external_link",
  "contact_value": "email address or external URL — leave blank if not given"
}

RULES:
- Return ONLY valid JSON, no markdown fencing, no commentary.
- Use lowercase for stage, commitment_level, contact_method, petal keys, language code.
- flower_petals MUST be a subset of the 7 valid keys above.`

export async function POST(request: NextRequest) {
  try {
    if (await isDailyLimitReached()) {
      return NextResponse.json({ error: 'Guild AI temporarily unavailable.' }, { status: 503 })
    }

    const { userId, pitchId, transcript, prep_context_text } = await request.json()
    if (!userId || !pitchId || !Array.isArray(transcript)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const prepContext = typeof prep_context_text === 'string' ? prep_context_text.slice(0, 15000) : ''

    const userMessage = `${prepContext ? 'Prep context from URLs the pitcher shared:\n\n' + prepContext + '\n\n---\n\n' : ''}Interview transcript:

${transcript.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}

Return the pitch JSON.`

    const result = await getAI().messages.create({
      model: GUILD_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = result.content[0].type === 'text' ? result.content[0].text : '{}'
    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[guild-pitch-extract] parse fail:', cleaned.slice(0, 400))
      return NextResponse.json({ error: 'Extraction parse failed' }, { status: 500 })
    }

    // Sanitize petals
    if (Array.isArray(parsed.flower_petals)) {
      parsed.flower_petals = parsed.flower_petals.filter((p: any) => typeof p === 'string' && PETALS.includes(p))
    } else {
      parsed.flower_petals = []
    }

    // Sanitize enums
    const stages = ['idea','gathering_people','has_core_group','seeking_land','has_land']
    if (!stages.includes(parsed.stage)) parsed.stage = 'idea'
    const commits = ['exploratory','part_time','full_time','lifetime']
    if (!commits.includes(parsed.commitment_level)) parsed.commitment_level = 'exploratory'
    if (parsed.contact_method !== 'email' && parsed.contact_method !== 'external_link') parsed.contact_method = 'email'

    // Save the transcript + extracted pitch on the interview row
    const supabase = getServiceClient()
    const totalTokens = result.usage.input_tokens + result.usage.output_tokens
    await supabase.from('guild_pitch_interviews').upsert({
      pitch_id: pitchId,
      transcript,
      extracted_pitch: parsed,
      prep_context_text: prepContext || null,
      language: parsed.language || 'en',
      model_used: GUILD_MODEL,
      tokens_used: totalTokens,
      cost_usd: null,
    })

    await logApiUsage({
      userId,
      feature: 'pitch_extraction',
      tokensInput: result.usage.input_tokens,
      tokensOutput: result.usage.output_tokens,
    })

    return NextResponse.json({ pitch: parsed })
  } catch (err) {
    console.error('[guild-pitch-extract]', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
