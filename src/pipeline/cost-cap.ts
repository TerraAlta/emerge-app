/**
 * Cost cap — hard kill-switch for the weekly pipeline.
 *
 * Tracks cumulative Claude API spend in the current process and throws
 * CostCapExceeded the moment the budget is breached. Catches the failure
 * mode where a new scraping source bypasses the pre-filter and quietly
 * spends $40+ in a single run.
 *
 * Configure via env var PIPELINE_MAX_USD (default 8). Belt + braces with
 * the workspace-level cap in the Anthropic Console.
 */

// Claude Haiku 4.5 pricing (USD per million tokens)
const HAIKU_INPUT_PER_M = 0.80
const HAIKU_CACHE_WRITE_PER_M = 1.00    // 1.25x base
const HAIKU_CACHE_READ_PER_M = 0.08     // 0.10x base
const HAIKU_OUTPUT_PER_M = 4.00

const DEFAULT_CAP_USD = 8

/**
 * Per-invocation budgets for the daily Vercel crons. These run unattended
 * every day, so they get a much tighter leash than the weekly launchd run:
 * a runaway daily cron costs 7x a runaway weekly one.
 */
export const DAILY_CRON_CAP_USD =
  parseFloat(process.env.DAILY_CRON_MAX_USD ?? '') || 0.5
export const NEWS_CRON_CAP_USD =
  parseFloat(process.env.NEWS_MAX_USD ?? '') || 0.3

export class CostCapExceeded extends Error {
  constructor(spent: number, cap: number) {
    super(`Pipeline cost cap exceeded: $${spent.toFixed(2)} of $${cap.toFixed(2)} budget`)
    this.name = 'CostCapExceeded'
  }
}

interface Usage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export class CostTracker {
  totalUsd = 0
  calls = 0
  inputTokens = 0
  cacheWriteTokens = 0
  cacheReadTokens = 0
  outputTokens = 0
  capUsd: number

  constructor() {
    const envCap = parseFloat(process.env.PIPELINE_MAX_USD ?? '')
    this.capUsd = Number.isFinite(envCap) && envCap > 0 ? envCap : DEFAULT_CAP_USD
  }

  /**
   * Zero the counters and (optionally) set a new cap for this run.
   *
   * REQUIRED at the top of every serverless entry point. Vercel reuses warm
   * function instances between invocations, so without a reset the module
   * singleton keeps accumulating across days until it trips the cap
   * permanently and every future run dies. Long-lived scripts (the weekly
   * launchd run) start a fresh process, so they must NOT reset mid-run.
   */
  reset(capUsd?: number): void {
    this.totalUsd = 0
    this.calls = 0
    this.inputTokens = 0
    this.cacheWriteTokens = 0
    this.cacheReadTokens = 0
    this.outputTokens = 0
    if (Number.isFinite(capUsd) && (capUsd as number) > 0) {
      this.capUsd = capUsd as number
    }
  }

  recordHaiku(usage: Usage | undefined): void {
    if (!usage) return

    const input = usage.input_tokens ?? 0
    const cacheWrite = usage.cache_creation_input_tokens ?? 0
    const cacheRead = usage.cache_read_input_tokens ?? 0
    const output = usage.output_tokens ?? 0

    const cost =
      (input * HAIKU_INPUT_PER_M) / 1_000_000 +
      (cacheWrite * HAIKU_CACHE_WRITE_PER_M) / 1_000_000 +
      (cacheRead * HAIKU_CACHE_READ_PER_M) / 1_000_000 +
      (output * HAIKU_OUTPUT_PER_M) / 1_000_000

    this.totalUsd += cost
    this.calls += 1
    this.inputTokens += input
    this.cacheWriteTokens += cacheWrite
    this.cacheReadTokens += cacheRead
    this.outputTokens += output

    if (this.totalUsd > this.capUsd) {
      throw new CostCapExceeded(this.totalUsd, this.capUsd)
    }
  }

  summary(): string {
    return [
      `Cost: $${this.totalUsd.toFixed(4)} / $${this.capUsd.toFixed(2)} cap`,
      `Calls: ${this.calls}`,
      `Tokens: ${this.inputTokens.toLocaleString()} input + ${this.cacheReadTokens.toLocaleString()} cache-read + ${this.cacheWriteTokens.toLocaleString()} cache-write + ${this.outputTokens.toLocaleString()} output`,
    ].join(' | ')
  }
}

export const costTracker = new CostTracker()
