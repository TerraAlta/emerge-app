/**
 * Guild Profile Extraction — AI reads the interview transcript and
 * extracts a structured practitioner profile.
 *
 * POST body: { userId, practitionerId, transcript: {role, content}[] }
 * Returns: { profile: ExtractedProfile }
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { GUILD_MODEL, MAX_EXTRACTION_TOKENS, isDailyLimitReached, logApiUsage } from '@/lib/guild-costs'

let _ai: Anthropic | null = null
function getAI() {
  if (!_ai) _ai = new Anthropic()
  return _ai
}

const SYSTEM_PROMPT = `You are the Guild profile extractor for Emerge, a regenerative practitioner network.

You will receive an interview transcript between a practitioner and the Guild interviewer. Your job is to extract a structured profile from the conversation.

Extract the following fields as JSON:

{
  "tagline": "One-line summary of what they do (max 120 chars)",
  "bio": "2-3 paragraph bio written in third person, warm and professional (max 500 words)",
  "specialties": ["array of specific skills/specialties mentioned"],
  "climate_zones_worked": ["climate zones they have experience in"],
  "project_scales": ["scales they work at, e.g. 'Garden (<0.5ha)', 'Farm (5-50ha)'"],
  "years_experience": number,
  "pdc_certified": boolean,
  "advanced_certifications": "any advanced certs mentioned, or empty string",
  "rate_range": "if mentioned, e.g. 'EUR 50-100/hr', otherwise empty string",
  "notable_projects": ["brief descriptions of 2-3 key projects mentioned"],
  "languages_detected": ["languages they mentioned working in"],
  "regions_experienced": ["regions/countries they have worked in"]
}

RULES:
- Only extract what was actually said. Do not invent or embellish.
- If something wasn't mentioned, use empty string or empty array.
- Write the bio as if introducing them to a potential client — warm, credible, specific.
- The tagline should capture their essence in one line.
- Return ONLY valid JSON, no markdown fencing, no explanation.`

export async function POST(request: NextRequest) {
  try {
    if (await isDailyLimitReached()) {
      return NextResponse.json(
        { error: 'Guild AI is temporarily unavailable. Please try again tomorrow.' },
        { status: 503 }
      )
    }

    const { userId, practitionerId, transcript } = await request.json()

    if (!userId || !practitionerId || !Array.isArray(transcript)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Format transcript for extraction
    const transcriptText = transcript
      .map((m: any) => `${m.role === 'assistant' ? 'Interviewer' : 'Practitioner'}: ${m.content}`)
      .join('\n\n')

    const result = await getAI().messages.create({
      model: GUILD_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Here is the interview transcript:\n\n${transcriptText}`,
      }],
    })

    const text = result.content[0].type === 'text' ? result.content[0].text : '{}'
    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim()

    let profile
    try {
      profile = JSON.parse(cleaned)
    } catch {
      console.error('[guild-extract] Failed to parse:', cleaned)
      return NextResponse.json({ error: 'Profile extraction failed. Please try again.' }, { status: 500 })
    }

    // Log usage
    await logApiUsage({
      userId,
      feature: 'extraction',
      tokensInput: result.usage.input_tokens,
      tokensOutput: result.usage.output_tokens,
    })

    return NextResponse.json({ profile })
  } catch (err) {
    console.error('[guild-extract]', err)
    return NextResponse.json({ error: 'Extraction failed. Please try again.' }, { status: 500 })
  }
}
