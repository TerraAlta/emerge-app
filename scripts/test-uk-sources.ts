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

import { permacultureUk } from '../src/pipeline/sources/permaculture-uk'
import { incredibleEdibleUk } from '../src/pipeline/sources/incredible-edible-uk'
import { nationalTrustUk } from '../src/pipeline/sources/national-trust-uk'
import { permablitzUk } from '../src/pipeline/sources/permablitz-uk'
import { landworkersUk } from '../src/pipeline/sources/landworkers-uk'
import { rewildingUk } from '../src/pipeline/sources/rewilding-uk'
import { scoreQuest } from '../src/pipeline/score-quest'
import type { SourceFetcher, RawEvent } from '../src/pipeline/sources/types'

// London as base for UK sources
const LONDON = { lat: 51.5074, lng: -0.1278, radiusKm: 200 }

const sources: SourceFetcher[] = [
  permacultureUk, incredibleEdibleUk, nationalTrustUk,
  permablitzUk, landworkersUk, rewildingUk,
]

async function main() {
  console.log('\n\u{1F1EC}\u{1F1E7} Emerge Pipeline \u2014 UK Sources Test')
  console.log(`   Location: London (${LONDON.lat}, ${LONDON.lng}) | Radius: ${LONDON.radiusKm}km\n`)

  let totalFetched = 0
  let totalScored = 0

  for (const source of sources) {
    const start = Date.now()
    let events: RawEvent[] = []

    console.log(`\u{1F4E1} ${source.name.toUpperCase()}`)

    try {
      events = await source.fetch(LONDON)
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

    // Score up to 3 events from each source
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
        console.log(`      "${event.title}"`)
        console.log(`      ${scored.ai_reasoning}`)
      } catch (err) {
        console.log(`   \u26A0\uFE0F  Score failed: ${(err as Error).message.slice(0, 60)}`)
      }
    }
    if (events.length > 3) console.log(`   ... and ${events.length - 3} more unscored`)
    console.log()
  }

  console.log('\u2500'.repeat(60))
  console.log(`\u{1F4CA} UK SUMMARY`)
  console.log(`   Sources: ${sources.length}`)
  console.log(`   Events fetched: ${totalFetched}`)
  console.log(`   Events scored: ${totalScored}`)
  console.log()
}

main().catch(console.error)
