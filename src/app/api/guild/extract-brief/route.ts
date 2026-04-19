/**
 * Guild Brief Extraction — reads intake transcript, returns structured brief.
 *
 * This brief becomes the free preview the client sees BEFORE paying.
 * It describes their project back to them + suggests which petals of
 * expertise are likely relevant, but does NOT name practitioners.
 *
 * POST body: { userId, projectId, transcript: {role, content}[] }
 * Returns:   { brief: ExtractedBrief }
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { GUILD_MODEL, MAX_EXTRACTION_TOKENS, isDailyLimitReached, logApiUsage } from '@/lib/guild-costs'

let _ai: Anthropic | null = null
function getAI() {
  if (!_ai) _ai = new Anthropic()
  return _ai
}

const SYSTEM_PROMPT = `You are the Guild brief extractor for Emerge, a regenerative practitioner network.

You will receive an intake conversation between a client and the Guild interviewer. Your job is to extract a structured project brief that will be shown to the client as a free preview before they decide to commission a full scoping document.

Extract the following as JSON:

{
  "project_name": "short working name for the project, under 80 chars",
  "tagline": "one-line description of what they want to create (max 140 chars)",
  "country": "country where the project is located",
  "region": "city/region if known, otherwise empty",
  "land_size_ha": number or null if unknown,
  "climate_zone": "one of: Tropical, Subtropical, Mediterranean, Temperate, Continental, Arid/Semi-arid, Oceanic, Subarctic, Highland, or empty if unclear",
  "project_scale": "one of: Urban/balcony, Garden (<0.5ha), Smallholding (0.5-5ha), Farm (5-50ha), Estate (50+ha), Community/public space, Institutional, Landscape scale",
  "project_type": "e.g. 'regenerative smallholding', 'community land', 'ecovillage', 'urban food forest', 'retreat centre'",
  "site_context": "2-3 sentence description of the land and its current state, in third person",
  "vision": "2-3 sentence description of what the client wants this place to become, in third person",
  "story_fragment": "1-2 sentences capturing their motivation or story in their own spirit (third person, warm)",
  "stakeholders": "who is involved — single person, couple, family, collective, association, etc.",
  "timeline": "their phase — 'just starting', 'early stages', 'mid-project', 'refining existing', 'scaling', or similar",
  "constraints": ["array of relevant constraints mentioned: budget, water, zoning, access, legal, infrastructure, etc."],
  "values": ["array of values/themes that resonate with them, from their own words: food sovereignty, community, rewilding, social, education, etc."],
  "help_sought": ["array of what kinds of help they are looking for in plain language"],
  "suggested_petals": ["array of keys from the 7 petals that are likely relevant: land-nature, building-technology, tools-materials, health-wellbeing, education-culture, finance-economics, governance-community"],
  "languages": ["array of languages the client is comfortable working in"]
}

RULES:
- Only extract what was actually said. Do not invent or embellish.
- If something is not known, use empty string, empty array, or null.
- Write with warmth and specificity. Avoid vague corporate language.
- suggested_petals must be valid keys only. Pick 2-5 that clearly fit what they described.
- Return ONLY valid JSON, no markdown fencing, no explanation.`

export async function POST(request: NextRequest) {
  try {
    if (await isDailyLimitReached()) {
      return NextResponse.json(
        { error: 'Guild AI is temporarily unavailable. Please try again tomorrow.' },
        { status: 503 }
      )
    }

    const { userId, projectId, transcript } = await request.json()

    if (!userId || !projectId || !Array.isArray(transcript)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const transcriptText = transcript
      .map((m: any) => `${m.role === 'assistant' ? 'Interviewer' : 'Client'}: ${m.content}`)
      .join('\n\n')

    const result = await getAI().messages.create({
      model: GUILD_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Here is the intake transcript:\n\n${transcriptText}` }],
    })

    const text = result.content[0].type === 'text' ? result.content[0].text : '{}'
    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim()

    let brief
    try {
      brief = JSON.parse(cleaned)
    } catch {
      console.error('[guild-extract-brief] parse fail:', cleaned)
      return NextResponse.json({ error: 'Brief extraction failed. Please try again.' }, { status: 500 })
    }

    await logApiUsage({
      userId,
      feature: 'extraction',
      tokensInput: result.usage.input_tokens,
      tokensOutput: result.usage.output_tokens,
    })

    return NextResponse.json({ brief })
  } catch (err) {
    console.error('[guild-extract-brief]', err)
    return NextResponse.json({ error: 'Extraction failed. Please try again.' }, { status: 500 })
  }
}
