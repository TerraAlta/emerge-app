import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role for inserts
)
const anthropic = new Anthropic()

// Simulated events from Meetup and Transition Towns sources in Lisbon area
const rawEvents = [
  // Meetup source
  {
    title: 'Horta Comunitária de Telheiras — Volunteer Day',
    description: 'Join our monthly volunteer day at the community garden. We will be planting spring crops, building compost bins, and sharing seeds. Beginners welcome! Tools and refreshments provided. Learn about urban food growing in Lisbon.',
    location: 'Horta Comunitária de Telheiras, Lisbon',
    lat: 38.7633,
    lng: -9.1647,
    starts_at: '2026-03-22T09:00:00+00:00',
    ends_at: '2026-03-22T13:00:00+00:00',
    source_name: 'meetup',
    source_url: 'https://meetup.com/horta-telheiras/events/123',
  },
  {
    title: 'Lisbon Fermentation Circle — Kombucha & Kimchi',
    description: 'Monthly gathering to share fermented foods, learn new techniques, and swap cultures. This month: kombucha brewing basics and seasonal kimchi with local vegetables. Bring a jar to take home your own starter.',
    location: 'Mercado de Arroios, Lisbon',
    lat: 38.7280,
    lng: -9.1350,
    starts_at: '2026-03-23T15:00:00+00:00',
    ends_at: '2026-03-23T18:00:00+00:00',
    source_name: 'meetup',
    source_url: 'https://meetup.com/lisbon-fermentation/events/456',
  },
  {
    title: 'Web3 Crypto Trading Meetup — Bull Run Strategies',
    description: 'Learn how to maximize your crypto portfolio during the next bull run. We will cover leveraged trading, memecoins, and automated bots. Sponsored by BinanceX. Free pizza and energy drinks.',
    location: 'WeWork Saldanha, Lisbon',
    lat: 38.7340,
    lng: -9.1460,
    starts_at: '2026-03-24T19:00:00+00:00',
    source_name: 'meetup',
    source_url: 'https://meetup.com/lisbon-crypto/events/789',
  },
  {
    title: 'Repair Café Lisbon — Fix Your Stuff, Learn a Skill',
    description: 'Bring broken electronics, clothing, bikes, or furniture and our volunteer fixers will help you repair them for free. Reduce waste, learn repair skills, and meet your neighbours. Coffee and cake available.',
    location: 'Associação Renovar a Mouraria, Lisbon',
    lat: 38.7148,
    lng: -9.1345,
    starts_at: '2026-03-29T10:00:00+00:00',
    ends_at: '2026-03-29T16:00:00+00:00',
    source_name: 'meetup',
    source_url: 'https://meetup.com/repair-cafe-lisbon/events/101',
  },
  // Transition Towns source
  {
    title: 'Transition Sintra — Intro to Natural Building with Cob',
    description: 'Hands-on workshop on building with cob (earth, sand, straw). We will construct a small garden bench using only natural materials. Part of Transition Sintra\'s regenerative skills series. Suitable for families.',
    location: 'Quinta da Ribafria, Sintra',
    lat: 38.7980,
    lng: -9.3820,
    starts_at: '2026-03-30T10:00:00+00:00',
    ends_at: '2026-03-30T17:00:00+00:00',
    source_name: 'transition-towns',
    source_url: 'https://transitionsintra.org/events/cob-workshop',
  },
  {
    title: 'Transition Cascais — Community Resilience Assembly',
    description: 'Open assembly to discuss local food security, energy cooperatives, and mutual aid networks in Cascais. We will plan the spring seed swap, map local producers, and organise neighbourhood sharing circles.',
    location: 'Casa da Guia, Cascais',
    lat: 38.6945,
    lng: -9.4215,
    starts_at: '2026-04-02T18:30:00+00:00',
    ends_at: '2026-04-02T20:30:00+00:00',
    source_name: 'transition-towns',
    source_url: 'https://transitioncascais.org/assembly-april',
  },
  {
    title: 'Luxury Wine Tasting & Networking for Executives',
    description: 'An exclusive evening for C-suite professionals. Sample premium Portuguese wines, enjoy gourmet canapés, and expand your professional network. Dress code: smart casual. €85 per person.',
    location: 'Hotel Ritz Four Seasons, Lisbon',
    lat: 38.7270,
    lng: -9.1530,
    starts_at: '2026-04-05T19:00:00+00:00',
    source_name: 'transition-towns', // misattributed to test filtering
    source_url: null,
  },
  {
    title: 'Foraging Walk — Edible Wild Plants of Arrábida',
    description: 'Guided walk through the Arrábida Natural Park identifying edible wild plants, medicinal herbs, and mushrooms. Learn sustainable harvesting practices and prepare a wild food lunch together on the trail.',
    location: 'Parque Natural da Arrábida, Setúbal',
    lat: 38.4900,
    lng: -8.9800,
    starts_at: '2026-04-06T08:30:00+00:00',
    ends_at: '2026-04-06T14:00:00+00:00',
    source_name: 'transition-towns',
    source_url: 'https://transitionsetubal.org/foraging-arrabida',
  },
]

const SCORE_THRESHOLD = 50

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
  console.log('\n🌱 Emerge Ingestion Pipeline — Lisbon (38.7169, -9.1393, 25km)\n')
  console.log(`   Sources: Meetup, Transition Towns`)
  console.log(`   Events found: ${rawEvents.length}`)
  console.log(`   Score threshold: ${SCORE_THRESHOLD}/100`)
  console.log('─'.repeat(65))

  const passed: string[] = []
  const failed: string[] = []

  for (const event of rawEvents) {
    process.stdout.write(`\n📋 "${event.title}"\n   Source: ${event.source_name} | `)

    try {
      const scored = await scoreEvent({
        title: event.title,
        description: event.description,
        location: event.location,
      })

      const score = Math.max(0, Math.min(100, Math.round(scored.score)))
      const pass = score >= SCORE_THRESHOLD
      const bar = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5))

      console.log(`Score: ${score}/100  [${bar}]`)
      console.log(`   Category: ${scored.category} | ${pass ? '✅ PASS' : '❌ FILTERED OUT'}`)
      console.log(`   Reason: ${scored.reasoning}`)

      if (pass) {
        // Insert into Supabase
        const { error } = await supabase.from('quests').insert({
          title: event.title,
          description: event.description,
          category: scored.category,
          geog: `POINT(${event.lng} ${event.lat})`,
          address: event.location,
          starts_at: event.starts_at,
          ends_at: event.ends_at ?? null,
          source_url: event.source_url ?? null,
          source_name: event.source_name,
          ai_score: score,
          ai_reasoning: scored.reasoning,
          image_url: null,
          max_participants: null,
        })

        if (error) {
          console.log(`   ⚠️  DB insert failed: ${error.message}`)
        } else {
          console.log(`   💾 Inserted into quests table`)
          passed.push(event.title)
        }
      } else {
        failed.push(event.title)
      }
    } catch (err: any) {
      console.log(`Error: ${err.message}`)
      failed.push(event.title)
    }

    console.log('─'.repeat(65))
  }

  // Summary
  console.log(`\n📊 Ingestion Summary`)
  console.log(`   Total events:  ${rawEvents.length}`)
  console.log(`   Passed (≥${SCORE_THRESHOLD}): ${passed.length}`)
  console.log(`   Filtered out:  ${failed.length}`)

  // Verify what's in the DB
  const { data, error } = await supabase
    .from('quests')
    .select('title, ai_score, category')
    .order('ai_score', { ascending: false })

  if (!error && data) {
    console.log(`\n📦 Quests now in database: ${data.length}`)
    for (const q of data) {
      console.log(`   ${q.ai_score}/100  [${q.category}]  ${q.title}`)
    }
  }

  console.log('\nDone.\n')
}

main()
