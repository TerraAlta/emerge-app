import { readFileSync } from 'fs'
import { resolve } from 'path'

const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIndex = trimmed.indexOf('=')
  if (eqIndex === -1) continue
  if (!process.env[trimmed.slice(0, eqIndex)]) process.env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1)
}

import { navdanyaGlobal } from '../src/pipeline/sources/navdanya-global'
import { localFuturesGlobal } from '../src/pipeline/sources/local-futures-global'
import { scoreQuest } from '../src/pipeline/score-quest'
import type { SourceFetcher, RawEvent } from '../src/pipeline/sources/types'

const GLOBAL = { lat: 0, lng: 0, radiusKm: 50000 }

// Test the sources
const sources: SourceFetcher[] = [navdanyaGlobal, localFuturesGlobal]

// Test the filter with foundational events
const testEvents = [
  { title: 'Navdanya Seed Festival — celebrating seed sovereignty',
    description: 'Annual seed festival at Navdanya Biodiversity Farm. Exchange heirloom seeds, learn seed saving techniques, tour the organic farm. Keynote by Vandana Shiva. Community feast with food grown on-site. Open to all, donation-based.',
    location: 'Navdanya Biodiversity Farm, Dehradun, India' },
  { title: 'Economics of Happiness film screening + community dialogue',
    description: "Screening of Helena Norberg-Hodge's documentary The Economics of Happiness, followed by facilitated community dialogue on building a local economy. What does localisation look like in our neighbourhood? Bring food to share.",
    location: 'Community centre, Lisbon, Portugal' },
  { title: 'World Localisation Day — connecting neighbours, growing roots',
    description: "Part of Local Futures' global World Localisation Day. Our neighbourhood is hosting a day of local food, local makers, local music. Meet the people who grow your food, fix your things, and teach your kids. Free entry.",
    location: 'Town square, Bristol, UK' },
  { title: 'Navdanya Earth University — two-week intensive course',
    description: 'Hands-on course in agroecology, seed saving, food sovereignty, and Earth Democracy. Live and work at the Navdanya farm. Learn from Vandana Shiva and Navdanya practitioners. Sliding scale fees.',
    location: 'Navdanya Biodiversity Farm, Dehradun, India' },
]

async function main() {
  console.log('\n\u{1F331} Emerge — Foundational Thinkers Test\n')

  // Phase 1: Test source fetchers
  console.log('=== SOURCE FETCHERS ===\n')
  for (const source of sources) {
    const start = Date.now()
    console.log(`\u{1F4E1} ${source.name.toUpperCase()}`)
    try {
      const events = await source.fetch(GLOBAL)
      console.log(`   Fetched: ${events.length} events (${Date.now() - start}ms)`)
      for (const e of events.slice(0, 3)) {
        console.log(`   \u2022 "${e.title.slice(0, 65)}"`)
      }
      if (events.length > 3) console.log(`   ... and ${events.length - 3} more`)
    } catch (err) {
      console.log(`   \u274C Error: ${(err as Error).message.slice(0, 80)}`)
    }
    console.log()
  }

  // Phase 2: Test filter with foundational events
  console.log('=== AI FILTER — FOUNDATIONAL EVENTS ===\n')
  for (const event of testEvents) {
    try {
      const scored = await scoreQuest({ title: event.title, description: event.description, location: event.location })
      const bar = '\u2588'.repeat(Math.round(scored.ai_score / 5)) + '\u2591'.repeat(20 - Math.round(scored.ai_score / 5))
      console.log(`\u2705 ${scored.ai_score}/100 [${bar}] [${scored.category}]`)
      console.log(`   "${event.title.slice(0, 65)}"`)
      console.log(`   ${scored.ai_reasoning}\n`)
    } catch (err) {
      console.log(`\u26A0\uFE0F  Error: ${(err as Error).message.slice(0, 60)}\n`)
    }
  }
}

main().catch(console.error)
