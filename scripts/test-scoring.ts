import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load env
const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIndex = trimmed.indexOf('=')
  if (eqIndex === -1) continue
  const key = trimmed.slice(0, eqIndex)
  const val = trimmed.slice(eqIndex + 1)
  if (!process.env[key]) process.env[key] = val
}

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

const testEvents = [
  {
    label: 'CLEAR PASS — Community permaculture workshop',
    title: 'Hands-On Permaculture Food Forest Workshop',
    description: 'Learn to design and plant a community food forest using permaculture principles. We will cover soil building, guild planting, water harvesting, and seed saving. All materials provided, bring your own gloves. Hosted by the local regenerative agriculture collective.',
    location: 'Centro de Permacultura, Sintra, Portugal',
  },
  {
    label: 'BORDERLINE — Yoga in the park',
    title: 'Sunday Morning Yoga in the Park',
    description: 'Join us for a relaxing outdoor yoga session in the municipal park. Open to all levels. Bring a mat and water bottle. Free event, donations welcome.',
    location: 'Parque Municipal, Caldas da Rainha, Portugal',
  },
  {
    label: 'CLEAR FAIL — Corporate tech product launch',
    title: 'iPhone 18 Launch Party & Unboxing Event',
    description: 'Be the first to see the new iPhone 18! Join us at the flagship store for an exclusive unboxing event with free cocktails, DJ set, and influencer meet-and-greet. Sponsored by Apple.',
    location: 'Apple Store, Lisbon, Portugal',
  },
]

async function scoreEvent(event: { title: string; description: string; location: string }) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are scoring community events for a regenerative living app called Emerge.

Rate this event for regenerative alignment (connection to nature, community resilience, skill-sharing, sustainability, local food systems, wellness).

Event: "${event.title}"
Description: "${event.description}"
Location: "${event.location}"

Respond in JSON only:
{
  "category": one of "nature" | "food" | "craft" | "community" | "wellness" | "learning",
  "score": 0-100 integer,
  "reasoning": "one sentence why"
}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return JSON.parse(text)
}

async function main() {
  console.log('\n🧪 Testing AI Quest Scoring Pipeline\n')
  console.log('─'.repeat(60))

  for (const event of testEvents) {
    console.log(`\n📋 ${event.label}`)
    console.log(`   "${event.title}"`)

    try {
      const result = await scoreEvent(event)
      const bar = '█'.repeat(Math.round(result.score / 5)) + '░'.repeat(20 - Math.round(result.score / 5))
      console.log(`   Score:    ${result.score}/100  [${bar}]`)
      console.log(`   Category: ${result.category}`)
      console.log(`   Reason:   ${result.reasoning}`)
    } catch (err: any) {
      console.log(`   ❌ Error: ${err.message}`)
    }

    console.log('─'.repeat(60))
  }

  console.log('\nDone.\n')
}

main()
