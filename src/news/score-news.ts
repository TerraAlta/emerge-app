/**
 * AI scoring for news items — Haiku 4.5, news-specific prompt.
 * Mirror of src/pipeline/score-quest.ts but with the news prompt
 * and returns a petal instead of a category.
 */
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { isCreditError, isRateLimitError, notifyPipelineFailure } from '@/lib/pipeline-monitor'
import { buildNewsScoringPrompt } from '@/lib/news-scoring-prompt'
import type { FlowerPetalKey } from './types'
import { PETAL_KEYS } from './types'

let _client: Anthropic | null = null
function getClient() {
  if (!_client) _client = new Anthropic()
  return _client
}

let _soulDoc: string | null = null
function getSoulDocument(): string {
  if (_soulDoc !== null) return _soulDoc
  try {
    _soulDoc = readFileSync(resolve(__dirname, '../pipeline/soul-document.txt'), 'utf-8')
  } catch {
    try {
      _soulDoc = readFileSync(resolve(process.cwd(), 'src/pipeline/soul-document.txt'), 'utf-8')
    } catch {
      _soulDoc = ''
    }
  }
  return _soulDoc
}

function isValidPetal(p: unknown): p is FlowerPetalKey {
  return typeof p === 'string' && (PETAL_KEYS as readonly string[]).includes(p)
}

export interface ScoredNews {
  petal: FlowerPetalKey
  ai_score: number
  ai_reasoning: string
}

export async function scoreNews(input: {
  title: string
  summary: string
  source_name: string
  defaultPetal: FlowerPetalKey
}): Promise<ScoredNews | null> {
  let message
  try {
    message = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: buildNewsScoringPrompt(getSoulDocument()),
      messages: [
        {
          role: 'user',
          content: `Source: ${input.source_name}
Title: "${input.title}"
Summary/excerpt: "${input.summary.slice(0, 1800)}"`,
        },
      ],
    })
  } catch (err) {
    if (isCreditError(err)) {
      await notifyPipelineFailure('credits_exhausted', { news_title: input.title })
      return null
    }
    if (isRateLimitError(err)) {
      console.warn(`[score-news] Rate limited, skipping: "${input.title}"`)
      return null
    }
    throw err
  }

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = text.replace(/```json\s*|```\s*/g, '').trim()
  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.warn(`[score-news] parse fail for "${input.title}": ${cleaned.slice(0, 200)}`)
    return null
  }

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)))
  const petal: FlowerPetalKey = isValidPetal(parsed.petal) ? parsed.petal : input.defaultPetal

  return {
    petal,
    ai_score: score,
    ai_reasoning: String(parsed.reasoning || '').slice(0, 300),
  }
}
