/**
 * Guild AI cost controls — tracks every AI call and enforces daily limits.
 *
 * NON-NEGOTIABLE RULES:
 * 1. All calls use claude-haiku-4-5-20251001 — never Sonnet/Opus
 * 2. Interview: max 15,000 tokens total
 * 3. Extraction: max 5,000 tokens total
 * 4. Daily global limit: EUR 2.00 (~$2.20)
 * 5. Every call logged to guild_api_usage table
 */

import { createClient } from '@supabase/supabase-js'

const GUILD_MODEL = 'claude-haiku-4-5-20251001'
const DAILY_LIMIT_USD = 2.20 // ~EUR 2.00
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

  const { data } = await supabase
    .from('guild_api_usage')
    .select('cost_usd')
    .gte('created_at', today.toISOString())

  if (!data) return false
  const totalToday = data.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0)
  return totalToday >= DAILY_LIMIT_USD
}

/** Log an AI call to the usage table */
export async function logApiUsage(params: {
  userId: string
  feature: 'interview' | 'extraction' | 'intake' | 'scoping'
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
