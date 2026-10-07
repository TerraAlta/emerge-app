/**
 * Guild AI cost controls — tracks every AI call and enforces daily limits.
 *
 * NON-NEGOTIABLE RULES:
 * 1. All calls use claude-haiku-4-5-20251001 — never Sonnet/Opus
 * 2. Interview: max 15,000 tokens total
 * 3. Extraction: max 5,000 tokens total
 * 4. Daily global limit: EUR 2.00 (~$2.20), and a per-user limit so one
 *    account can't use up everyone's day
 * 5. Every call logged to guild_api_usage table
 */

import { createClient } from '@supabase/supabase-js'

const GUILD_MODEL = 'claude-haiku-4-5-20251001'
const DAILY_LIMIT_USD = 2.20 // ~EUR 2.00
// A full onboarding costs ~$0.02; this is ~15 of them. Stops one account
// (or a script) from exhausting the global cap for everyone.
const USER_DAILY_LIMIT_USD = 0.30
const MAX_MESSAGE_CHARS = 8000
const MAX_INTERVIEW_TOKENS = 15000
const MAX_EXTRACTION_TOKENS = 5000

// Haiku pricing per 1M tokens
const HAIKU_INPUT_PER_M = 1.00  // $1.00/M input
const HAIKU_OUTPUT_PER_M = 5.00 // $5.00/M output

export { GUILD_MODEL, MAX_INTERVIEW_TOKENS, MAX_EXTRACTION_TOKENS }

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Calculate cost in USD from token counts */
export function calculateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * HAIKU_INPUT_PER_M + (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_M
}

/** Check if daily limit has been exceeded */
export async function isDailyLimitReached(): Promise<boolean> {
  const supabase = getServiceClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('guild_api_usage')
    .select('cost_usd')
    .gte('created_at', today.toISOString())

  // Fail closed: if we can't see today's spend, don't spend more.
  if (error || !data) return true
  const totalToday = data.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0)
  return totalToday >= DAILY_LIMIT_USD
}

/** True once this user has spent their share of today's Guild AI budget. */
export async function isUserDailyLimitReached(userId: string): Promise<boolean> {
  const supabase = getServiceClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('guild_api_usage')
    .select('cost_usd')
    .eq('user_id', userId)
    .gte('created_at', today.toISOString())

  if (error || !data) return true
  const spent = data.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0)
  return spent >= USER_DAILY_LIMIT_USD
}

/**
 * A client-sent chat transcript, reduced to what the interview prompts expect:
 * user/assistant turns with plain-text content. Without this a caller could
 * send image/document blocks or other roles straight to Anthropic, slipping
 * past the length-based token estimate.
 */
export function cleanTranscript(transcript: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(transcript)) return []
  return transcript
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
}

/** Log an AI call to the usage table */
export async function logApiUsage(params: {
  userId: string
  feature: 'interview' | 'extraction' | 'intake' | 'scoping' | 'pitch_interview' | 'pitch_extraction' | 'pitch_matching'
  tokensInput: number
  tokensOutput: number
}): Promise<void> {
  const cost = calculateCost(params.tokensInput, params.tokensOutput)
  const supabase = getServiceClient()

  await supabase.from('guild_api_usage').insert({
    user_id: params.userId,
    feature: params.feature,
    model_used: GUILD_MODEL,
    tokens_input: params.tokensInput,
    tokens_output: params.tokensOutput,
    cost_usd: cost,
  })
}

/** Get today's total spend */
export async function getTodaySpend(): Promise<number> {
  const supabase = getServiceClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('guild_api_usage')
    .select('cost_usd')
    .gte('created_at', today.toISOString())

  if (!data) return 0
  return data.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0)
}
