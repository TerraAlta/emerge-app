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

import { permaculturaEs } from '../src/pipeline/sources/permacultura-es'
import { transitionEs } from '../src/pipeline/sources/transition-es'
import { ecoaldeasEs } from '../src/pipeline/sources/ecoaldeas-es'
import { resilienceEs } from '../src/pipeline/sources/resilience-es'
import { huertosEs } from '../src/pipeline/sources/huertos-es'
import { permaculturaIt } from '../src/pipeline/sources/permacultura-it'
import { riveIt } from '../src/pipeline/sources/rive-it'
import { transitionIt } from '../src/pipeline/sources/transition-it'
import { damanhurIt } from '../src/pipeline/sources/damanhur-it'
import { scoreQuest } from '../src/pipeline/score-quest'
import type { SourceFetcher, RawEvent } from '../src/pipeline/sources/types'

// Madrid for Spain, Rome for Italy
const MADRID = { lat: 40.4168, lng: -3.7038, radiusKm: 500 }

const sources: SourceFetcher[] = [
  permaculturaEs, transitionEs, ecoaldeasEs, resilienceEs, huertosEs,
  permaculturaIt, riveIt, transitionIt, damanhurIt,
]

async function main() {
  console.log('\n\u{1F1EA}\u{1F1F8}\u{1F1EE}\u{1F1F9} Emerge Pipeline \u2014 Spain & Italy Sources Test')
  console.log(`   Base: Madrid (${MADRID.lat}, ${MADRID.lng}) | Radius: ${MADRID.radiusKm}km\n`)

  let totalFetched = 0
  let totalScored = 0

  for (const source of sources) {
    const start = Date.now()
    let events: RawEvent[] = []

    console.log(`\u{1F4E1} ${source.name.toUpperCase()}`)

    try {
      events = await source.fetch(MADRID)
      const ms = Date.now() - start
      console.log(`   Fetched: ${events.length} events (${ms}ms)`)
      totalFetched += events.length
    } catch (err) {
      console.log(`   \u274C Fetch error: ${(err as Error).message.slice(0, 80)}`)
      console.log()
      continue
    }

    if (events.length === 0) { console.log(`   (no events returned)\n`); continue }

    for (const event of events.slice(0, 2)) {
      try {
        const scored = await scoreQuest({ title: event.title, description: event.description, location: event.location_name })
        totalScored++
        const bar = '\u2588'.repeat(Math.round(scored.ai_score / 5)) + '\u2591'.repeat(20 - Math.round(scored.ai_score / 5))
        const icon = scored.ai_score >= 50 ? '\u2705' : '\u274C'
        console.log(`   ${icon} ${scored.ai_score}/100 [${bar}] [${scored.category}]`)
        console.log(`      "${event.title.slice(0, 70)}"`)
        console.log(`      ${scored.ai_reasoning}`)
      } catch (err) {
        console.log(`   \u26A0\uFE0F  Score failed: ${(err as Error).message.slice(0, 60)}`)
      }
    }
    if (events.length > 2) console.log(`   ... and ${events.length - 2} more unscored`)
    console.log()
  }

  console.log('\u2500'.repeat(60))
  console.log(`\u{1F4CA} SPAIN & ITALY SUMMARY`)
  console.log(`   Sources: ${sources.length}`)
  console.log(`   Events fetched: ${totalFetched}`)
  console.log(`   Events scored: ${totalScored}\n`)
}

main().catch(console.error)
