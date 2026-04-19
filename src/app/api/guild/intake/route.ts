/**
 * Guild Client Intake — adaptive project intake conversation.
 *
 * Client describes their land/project/goals. AI asks 10-15 warm, adaptive
 * questions to understand site context, regenerative intent, scale,
 * constraints, values, and what kind of practitioners might help.
 *
 * POST body: { userId, transcript: {role, content}[] }
 * Returns:   { reply: string, done: boolean }
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { GUILD_MODEL, MAX_INTERVIEW_TOKENS, isDailyLimitReached, logApiUsage } from '@/lib/guild-costs'

let _ai: Anthropic | null = null
function getAI() {
  if (!_ai) _ai = new Anthropic()
  return _ai
}

const MAX_TURNS = 15

const SYSTEM_PROMPT = `You are the Guild intake interviewer for Emerge, a regenerative practitioner network.

Your role: conduct a warm, grounded, 10-15 question conversation with someone who wants help designing or developing a regenerative project. You are drawing out their story and context so we can build a rich scoping brief — not evaluating or gatekeeping.

WHAT YOU NEED TO UNDERSTAND (adapt to them, don't interrogate):
- The land or space: where is it, what's the climate, what's the size and current state
- Their vision: what do they want this place to become, in their own words
- Their story: how did they arrive at this project, what's motivating them
- The people: who is involved, who will live/work there, is this personal or collective
- Timeline and phase: are they just starting, mid-project, or refining something existing
- Constraints: budget range (rough), legal/zoning, water, infrastructure, access
- Values: regenerative, food sovereignty, community, rewilding, social — what resonates
- What help they are looking for: design, building, facilitation, governance, economics
- Languages they are comfortable working in
- Anything unique — past attempts, existing practitioners involved, cultural context

INTERVIEW GUIDELINES:
- Begin by asking them to describe the project and the land in their own words
- Follow the energy — if they mention something rich (a dream, a struggle, a relationship with the land), follow up
- Be conversational, warm, and curious. Not a form.
- Use regenerative/permaculture language naturally but never jargon-heavy
- Ask ONE question at a time
- Keep your responses concise (2-3 sentences max before the question)
- Don't promise outcomes or practitioner matches — that comes later
- After 10-15 substantive exchanges, wrap up warmly
- When complete, end your response with the exact marker: [INTAKE_COMPLETE]

The conversation should feel like a walk around their land with a thoughtful friend, not a job application.`

export async function POST(request: NextRequest) {
  try {
    if (await isDailyLimitReached()) {
      return NextResponse.json(
        { error: 'Guild AI is temporarily unavailable. Please try again tomorrow.' },
        { status: 503 }
      )
    }

    const { userId, transcript } = await request.json()

    if (!userId || !Array.isArray(transcript)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const transcriptText = JSON.stringify(transcript)
    const estimatedTokens = Math.ceil(transcriptText.length / 4)
    if (estimatedTokens > MAX_INTERVIEW_TOKENS) {
      return NextResponse.json({
        reply: 'Thank you so much for sharing all of this. I have a rich picture of your project and the land now. [INTAKE_COMPLETE]',
        done: true,
      })
    }

    const userTurns = transcript.filter((m: any) => m.role === 'user').length
    const forceDone = userTurns >= MAX_TURNS

    const messages = [
      ...transcript.map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    if (messages.length === 0) {
      messages.push({
        role: 'user',
        content: 'I would like to commission a regenerative scoping for my project. Please start the intake.',
      })
    }

    if (forceDone) {
      messages.push({
        role: 'user',
        content: '(System note: this is the final turn. Please wrap up the intake warmly and include [INTAKE_COMPLETE] at the end.)',
      })
    }

    const result = await getAI().messages.create({
      model: GUILD_MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages,
    })

    const reply = result.content[0].type === 'text' ? result.content[0].text : ''
    const done = reply.includes('[INTAKE_COMPLETE]') || forceDone
    const cleanReply = reply.replace('[INTAKE_COMPLETE]', '').trim()

    await logApiUsage({
      userId,
      feature: 'intake',
      tokensInput: result.usage.input_tokens,
      tokensOutput: result.usage.output_tokens,
    })

    return NextResponse.json({ reply: cleanReply, done })
  } catch (err) {
    console.error('[guild-intake]', err)
    return NextResponse.json({ error: 'Intake failed. Please try again.' }, { status: 500 })
  }
}
