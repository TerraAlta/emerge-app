import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { isCreditError, isRateLimitError, notifyPipelineFailure } from '@/lib/pipeline-monitor'

let _client: Anthropic | null = null
function getClient() {
  if (!_client) _client = new Anthropic()
  return _client
}

interface RawEvent {
  title: string
  description: string
  location?: string
}

interface ScoredQuest {
  category: 'nature' | 'food' | 'craft' | 'community' | 'wellness' | 'learning'
  ai_score: number
  ai_reasoning: string
}

/** Load the soul document from disk — the living philosophy of Emerge */
let _soulDoc: string | null = null
function getSoulDocument(): string {
  if (!_soulDoc) {
    try {
      _soulDoc = readFileSync(resolve(__dirname, 'soul-document.txt'), 'utf-8')
    } catch {
      // Fallback: try from process.cwd()
      try {
        _soulDoc = readFileSync(resolve(process.cwd(), 'src/pipeline/soul-document.txt'), 'utf-8')
      } catch {
        _soulDoc = ''
      }
    }
  }
  return _soulDoc
}

function buildSystemPrompt(): string {
  const soul = getSoulDocument()

  return `You are the AI filter for Emerge, a regenerative community quest app.

${soul ? soul + '\n\n' : ''}RESPONSE FORMAT — assign the best-fit category and score:
Categories: nature, food, craft, community, wellness, learning

RESPOND IN JSON ONLY — no markdown, no backticks, no explanation outside the JSON:
{"category":"nature|food|craft|community|wellness|learning","score":0-100,"reasoning":"one sentence"}`
}

/**
 * Uses Claude to score a community event for regenerative alignment.
 * Reads the soul document from soul-document.txt as its system prompt.
 * Returns a category, score (0-100), and reasoning — or null if scoring fails due to credits/rate limits.
 */
export async function scoreQuest(event: RawEvent): Promise<ScoredQuest | null> {
  let message
  try {
    message = await getClient().messages.create({
      model: 'claude-haiku-4-5-20241022',
      max_tokens: 200,
      system: buildSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `Event: "${event.title}"
Description: "${event.description}"
Location: "${event.location ?? 'unknown'}"`,
        },
      ],
    })
  } catch (err) {
    if (isCreditError(err)) {
      await notifyPipelineFailure('credits_exhausted', { event: event.title })
      return null
    }
    if (isRateLimitError(err)) {
      console.warn(`[score-quest] Rate limited, skipping: "${event.title}"`)
      return null
    }
    throw err
  }

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  // Strip any markdown fencing the model might add despite instructions
  const cleaned = text.replace(/```json\s*|```\s*/g, '').trim()
  const parsed = JSON.parse(cleaned)

  let score = Math.max(0, Math.min(100, Math.round(parsed.score)))

  // Seasonal boost: orchard/harvest events score 1.2x during Sep-Nov
  const month = new Date().getMonth() // 0-indexed: 8=Sep, 9=Oct, 10=Nov
  if (month >= 8 && month <= 10) {
    const harvestKeywords = /orchard|harvest|apple|cider|pressing|gleaning|wassail|pruning|grafting|forage|wild harvest|streuobst|mosterei/i
    const text = `${event.title} ${event.description}`
    if (harvestKeywords.test(text)) {
      score = Math.min(100, Math.round(score * 1.2))
    }
  }

  return {
    category: parsed.category,
    ai_score: score,
    ai_reasoning: parsed.reasoning,
  }
}
