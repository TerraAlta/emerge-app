/**
 * Guild Pitch Interview — adaptive AI conversation for founders pitching a
 * project vision. Short, warm, multilingual.
 *
 * POST body: { userId, transcript, prep_context_text?: string }
 * Returns:   { reply: string, done: boolean }
 *
 * With prep_context_text (pitcher shared URLs), AI aims for 5-7 turns.
 * Without, AI aims for 8-12 turns. Hard cap: 12 turns either way.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { GUILD_MODEL, MAX_INTERVIEW_TOKENS, isDailyLimitReached, logApiUsage } from '@/lib/guild-costs'

let _ai: Anthropic | null = null
function getAI() {
  if (!_ai) _ai = new Anthropic()
  return _ai
}

const MAX_TURNS = 12

function buildSystemPrompt(hasPrepContext: boolean, prepContext: string): string {
  return `You are the Guild pitch interviewer for Emerge, a regenerative practitioner network.

Your role: conduct a warm, focused ${hasPrepContext ? '5-7' : '8-12'} question conversation with a founder who has a seed of a project — a vision for an ecovillage, intentional community, eco-school, farm, healing centre, or similar — but no group yet. Help them articulate the pitch they will publish to find co-founders, practitioners, and aligned people.

${hasPrepContext ? `CONTEXT THE USER SHARED BEFORE THE INTERVIEW (from URLs they pasted):

---
${prepContext}
---

Use this context to SKIP questions they've already answered implicitly. Do NOT ask things the material above already tells you. Ask only clarifying or missing-piece questions. Aim for 5-7 turns, hard cap 12.

` : ''}WHAT A GOOD PITCH CONTAINS (cover what is missing — adapt, don't interrogate):
1. Language of the pitch — ASK FIRST TURN if not obvious from greeting
2. The ONE sentence — specific enough that some people read it and say "not for me"
3. What they are NOT building (what to exclude)
4. Stage — idea / gathering people / has core group / seeking land / already has land
5. Commitment level they're asking of people who join — exploratory, part-time, full-time, lifetime
6. Geographic scope — specific region, country, continent, or anywhere
7. Which domains of the permaculture flower the project touches (land/nature, building/tech, tools/materials, health/wellbeing, education/culture, finance/economics, governance/community)
8. Roles they are looking for right now
9. What THEY bring — skills, capital range, land, time, network
10. Seed capital range if they're comfortable sharing (rough, non-binding)
11. Preferred contact method — email or external link
12. Something they're afraid of losing by being specific
13. What success looks like in 90 days for the pitch itself (not the whole project)

GUIDELINES:
- Begin by asking them what language they want to do this in, then switch to that language for the rest of the interview
- After language, ask for the one-sentence vision first — the rest orbits around it
- If stage is "has_land", skip land-search questions
- Follow the energy — if they describe something vividly, ask a follow-up before moving on
- Be warm and curious. Not a form. Regenerative/permaculture language used naturally.
- Ask ONE question at a time. Keep responses to 2-3 sentences before the question.
- Do NOT promise matches or outcomes
- After the needed questions, wrap up warmly and end with the exact marker: [PITCH_INTERVIEW_COMPLETE]

HARD RULE: do not exceed 12 assistant turns total, regardless of how much territory remains. Wrap up and mark complete when you hit 12.

The conversation should feel like a thoughtful walk with someone who is helping you name your own project, not a pitch evaluation.`
}

export async function POST(request: NextRequest) {
  try {
    if (await isDailyLimitReached()) {
      return NextResponse.json(
        { error: 'Guild AI is temporarily unavailable. Please try again tomorrow.' },
        { status: 503 }
      )
    }

    const { userId, transcript, prep_context_text } = await request.json()
    if (!userId || !Array.isArray(transcript)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const prepContext = typeof prep_context_text === 'string' ? prep_context_text.slice(0, 15000) : ''
    const hasPrep = prepContext.length > 100

    const transcriptText = JSON.stringify(transcript)
    const estimatedTokens = Math.ceil(transcriptText.length / 4)
    if (estimatedTokens > MAX_INTERVIEW_TOKENS) {
      return NextResponse.json({
        reply: 'Thank you — I have what I need. Let\'s move to the next step. [PITCH_INTERVIEW_COMPLETE]',
        done: true,
      })
    }

    const userTurns = transcript.filter((m: any) => m.role === 'user').length
    const forceDone = userTurns >= MAX_TURNS

    const messages = [
      ...transcript.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    if (messages.length === 0) {
      messages.push({
        role: 'user',
        content: 'I would like to publish a pitch for my project. Please start.',
      })
    }

    if (forceDone) {
      messages.push({
        role: 'user',
        content: '(System note: this is the final turn. Please wrap up warmly and include [PITCH_INTERVIEW_COMPLETE] at the end.)',
      })
    }

    const result = await getAI().messages.create({
      model: GUILD_MODEL,
      max_tokens: 500,
      system: buildSystemPrompt(hasPrep, prepContext),
      messages,
    })

    const reply = result.content[0].type === 'text' ? result.content[0].text : ''
    const done = reply.includes('[PITCH_INTERVIEW_COMPLETE]') || forceDone
    const cleanReply = reply.replace('[PITCH_INTERVIEW_COMPLETE]', '').trim()

    await logApiUsage({
      userId,
      feature: 'pitch_interview',
      tokensInput: result.usage.input_tokens,
      tokensOutput: result.usage.output_tokens,
    })

    return NextResponse.json({ reply: cleanReply, done })
  } catch (err) {
    console.error('[guild-pitch-interview]', err)
    return NextResponse.json({ error: 'Interview failed. Please try again.' }, { status: 500 })
  }
}
