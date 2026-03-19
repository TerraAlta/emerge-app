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

import { mundraubDe } from '../src/pipeline/sources/mundraub-de'
import { permakulturDe } from '../src/pipeline/sources/permakultur-de'
import { transitionDe } from '../src/pipeline/sources/transition-de'
import { foodsharingDe } from '../src/pipeline/sources/foodsharing-de'
import { solawiDe } from '../src/pipeline/sources/solawi-de'
import { zukunftsorteDe } from '../src/pipeline/sources/zukunftsorte-de'
import { siebenLindenDe } from '../src/pipeline/sources/sieben-linden-de'
import { scoreQuest } from '../src/pipeline/score-quest'
import type { SourceFetcher, RawEvent } from '../src/pipeline/sources/types'

// Berlin as base for German sources
const BERLIN = { lat: 52.5200, lng: 13.4050, radiusKm: 200 }

const sources: SourceFetcher[] = [
  permakulturDe, transitionDe, mundraubDe, foodsharingDe,
  solawiDe, zukunftsorteDe, siebenLindenDe,
]

async function main() {
  console.log('\n\u{1F1E9}\u{1F1EA} Emerge Pipeline \u2014 German Sources Test')
  console.log(`   Location: Berlin (${BERLIN.lat}, ${BERLIN.lng}) | Radius: ${BERLIN.radiusKm}km\n`)

  let totalFetched = 0
  let totalScored = 0

  for (const source of sources) {
    const start = Date.now()
    let events: RawEvent[] = []

    console.log(`\u{1F4E1} ${source.name.toUpperCase()}`)

    try {
      events = await source.fetch(BERLIN)
      const ms = Date.now() - start
      console.log(`   Fetched: ${events.length} events (${ms}ms)`)
      totalFetched += events.length
    } catch (err) {
      console.log(`   \u274C Fetch error: ${(err as Error).message.slice(0, 80)}`)
      console.log()
      continue
    }

    if (events.length === 0) {
      console.log(`   (no events returned)`)
      console.log()
      continue
    }

    // Score up to 3 events
    const toScore = events.slice(0, 3)
    for (const event of toScore) {
      try {
        const scored = await scoreQuest({
          title: event.title,
          description: event.description,
          location: event.location_name,
        })
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
    if (events.length > 3) console.log(`   ... and ${events.length - 3} more unscored`)
    console.log()
  }

  console.log('\u2500'.repeat(60))
  console.log(`\u{1F4CA} GERMANY SUMMARY`)
  console.log(`   Sources: ${sources.length}`)
  console.log(`   Events fetched: ${totalFetched}`)
  console.log(`   Events scored: ${totalScored}`)
  console.log()
}

main().catch(console.error)
