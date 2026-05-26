/**
 * Guild AI Interview — adaptive practitioner onboarding conversation.
 * Uses Haiku with strict token limits and cost tracking.
 *
 * POST body: { userId, petals: string[], transcript: {role, content}[] }
 * Returns: { reply: string, done: boolean }
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { GUILD_MODEL, MAX_INTERVIEW_TOKENS, isDailyLimitReached, logApiUsage } from '@/lib/guild-costs'
import { FLOWER_PETALS } from '@/lib/flower-petals'

let _ai: Anthropic | null = null
function getAI() {
  if (!_ai) _ai = new Anthropic()
  return _ai
}

const MAX_TURNS = 15 // Hard cap on interview length

function buildSystemPrompt(petals: string[], prepContext: string): string {
  const petalNames = petals
    .map(k => FLOWER_PETALS.find(p => p.key === k)?.label)
    .filter(Boolean)
    .join(', ')

  const hasPrep = prepContext.length > 100
  const prepBlock = hasPrep
    ? `CONTEXT THE USER SHARED BEFORE THE INTERVIEW (from URLs they pasted):

---
${prepContext}
---

Use this to SKIP questions they've already answered. Aim for 5-7 turns, hard cap 15. Do not re-ask things the material above already tells you.

`
    : ''

  return `You are the Guild interviewer for Emerge, a regenerative practitioner network.

Your role: conduct a warm, curious, ${hasPrep ? '5-7' : '10-15'} question interview to understand this practitioner's real experience. You are NOT evaluating or gatekeeping. You are drawing out their story so we can build a rich semantic profile.

${prepBlock}This practitioner works in: ${petalNames}

INTERVIEW GUIDELINES:
- Start with their story: how did they come to this work?
- Ask about specific projects they've worked on (scale, location, outcomes)
- Ask about their teaching/facilitation experience
- Ask about languages they work in and regions they know
- Ask about their preferred project scale and client type
- Ask about what they're looking for (types of projects, collaboration style)
- Adapt your questions based on their answers — don't follow a rigid script
- Be conversational, warm, and respectful of their expertise
- Use permaculture language naturally but don't be jargon-heavy
- If they mention something interesting, follow up on it
- After 10-15 questions, wrap up naturally with a thank you

RESPONSE FORMAT:
- Ask ONE question at a time
- Keep your responses concise (2-3 sentences max before the question)
- When the interview is complete (10-15 turns), end your response with the exact marker: [INTERVIEW_COMPLETE]

The interview should feel like a good conversation over tea, not a job application.`
}

export async function POST(request: NextRequest) {
  try {
    // Daily limit check
    if (await isDailyLimitReached()) {
      return NextResponse.json(
        { error: 'Guild AI is temporarily unavailable. Please try again tomorrow.' },
        { status: 503 }
      )
    }

    const { userId, petals, transcript, prep_context_text } = await request.json()
    const prepContext = typeof prep_context_text === 'string' ? prep_context_text.slice(0, 15000) : ''

    if (!userId || !petals?.length || !Array.isArray(transcript)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check token budget — rough estimate from transcript length
    const transcriptText = JSON.stringify(transcript)
    const estimatedTokens = Math.ceil(transcriptText.length / 4)
    if (estimatedTokens > MAX_INTERVIEW_TOKENS) {
      return NextResponse.json(
        { reply: 'Thank you so much for sharing your experience. This has been a wonderful conversation and I have a rich understanding of your practice now. [INTERVIEW_COMPLETE]', done: true }
      )
    }

    // Check turn limit
    const userTurns = transcript.filter((m: any) => m.role === 'user').length
    const forceDone = userTurns >= MAX_TURNS

    // Build messages for Claude
    const messages = [
      ...transcript.map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    // If first turn (no transcript), add opening
    if (messages.length === 0) {
      messages.push({
        role: 'user',
        content: 'I would like to join the Guild as a practitioner. Please start the interview.',
      })
    }

    // If forcing done, append instruction
    if (forceDone) {
      messages.push({
        role: 'user',
        content: '(System note: this is the final turn. Please wrap up the interview warmly and include [INTERVIEW_COMPLETE] at the end.)',
      })
    }

    const result = await getAI().messages.create({
      model: GUILD_MODEL,
      max_tokens: 500,
      system: buildSystemPrompt(petals, prepContext),
      messages,
    })

    const reply = result.content[0].type === 'text' ? result.content[0].text : ''
    const done = reply.includes('[INTERVIEW_COMPLETE]') || forceDone

    // Clean the marker from the displayed text
    const cleanReply = reply.replace('[INTERVIEW_COMPLETE]', '').trim()

    // Log usage
    await logApiUsage({
      userId,
      feature: 'interview',
      tokensInput: result.usage.input_tokens,
      tokensOutput: result.usage.output_tokens,
    })

    return NextResponse.json({ reply: cleanReply, done })
  } catch (err: any) {
    console.error('[guild-interview]', err)
    // Anthropic rejects with 400 + 'credit balance' when the workspace is out
    // of credits. Surface a clear admin-actionable message instead of the
    // generic 'try again' which sends users into a retry loop.
    const msg = err?.error?.error?.message || err?.message || ''
    if (typeof msg === 'string' && msg.toLowerCase().includes('credit balance')) {
      return NextResponse.json(
        { error: 'Guild AI is temporarily unavailable — admin has been notified. Try again in a bit, or use the manual form.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Interview failed. Please try again.' }, { status: 500 })
  }
}
