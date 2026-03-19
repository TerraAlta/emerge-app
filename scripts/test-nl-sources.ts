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

import { permacultuurNl } from '../src/pipeline/sources/permacultuur-nl'
import { transitieNl } from '../src/pipeline/sources/transitie-nl'
import { herenborenNl } from '../src/pipeline/sources/herenboeren-nl'
import { voedselbosNl } from '../src/pipeline/sources/voedselbos-nl'
import { repaircafeNl } from '../src/pipeline/sources/repaircafe-nl'
import { scoreQuest } from '../src/pipeline/score-quest'
import type { SourceFetcher, RawEvent } from '../src/pipeline/sources/types'

// Amsterdam as base
const AMSTERDAM = { lat: 52.3676, lng: 4.9041, radiusKm: 100 }

const sources: SourceFetcher[] = [
  permacultuurNl, transitieNl, herenborenNl, voedselbosNl, repaircafeNl,
]

async function main() {
  console.log('\n\u{1F1F3}\u{1F1F1} Emerge Pipeline \u2014 Dutch Sources Test')
  console.log(`   Location: Amsterdam (${AMSTERDAM.lat}, ${AMSTERDAM.lng}) | Radius: ${AMSTERDAM.radiusKm}km\n`)

  let totalFetched = 0
  let totalScored = 0

  for (const source of sources) {
    const start = Date.now()
    let events: RawEvent[] = []

    console.log(`\u{1F4E1} ${source.name.toUpperCase()}`)

    try {
      events = await source.fetch(AMSTERDAM)
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

    // Score up to 3
    for (const event of events.slice(0, 3)) {
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
        console.log(`      ${event.location_name} | ${event.cost}`)
        console.log(`      ${scored.ai_reasoning}`)
      } catch (err) {
        console.log(`   \u26A0\uFE0F  Score failed: ${(err as Error).message.slice(0, 60)}`)
      }
    }
    if (events.length > 3) console.log(`   ... and ${events.length - 3} more unscored`)
    console.log()
  }

  console.log('\u2500'.repeat(60))
  console.log(`\u{1F4CA} NETHERLANDS SUMMARY`)
  console.log(`   Sources: ${sources.length}`)
  console.log(`   Events fetched: ${totalFetched}`)
  console.log(`   Events scored: ${totalScored}`)
  console.log()
}

main().catch(console.error)
