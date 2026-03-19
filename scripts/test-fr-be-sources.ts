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

import { colibrisFr } from '../src/pipeline/sources/colibris-fr'
import { permacultureFr } from '../src/pipeline/sources/permaculture-fr'
import { incroyablesFr } from '../src/pipeline/sources/incroyables-fr'
import { transitionFr } from '../src/pipeline/sources/transition-fr'
import { terredeliensFr } from '../src/pipeline/sources/terredeliens-fr'
import { amapFr } from '../src/pipeline/sources/amap-fr'
import { transitieBe } from '../src/pipeline/sources/transitie-be'
import { transitionWallonieBe } from '../src/pipeline/sources/transition-wallonie-be'
import { permacultuurBe } from '../src/pipeline/sources/permacultuur-be'
import { csaBe } from '../src/pipeline/sources/csa-be'
import { csaWallonieBe } from '../src/pipeline/sources/csa-wallonie-be'
import { scoreQuest } from '../src/pipeline/score-quest'
import type { SourceFetcher, RawEvent } from '../src/pipeline/sources/types'

const PARIS = { lat: 48.8566, lng: 2.3522, radiusKm: 300 }

const sources: SourceFetcher[] = [
  colibrisFr, permacultureFr, incroyablesFr, transitionFr, terredeliensFr, amapFr,
  transitieBe, transitionWallonieBe, permacultuurBe, csaBe, csaWallonieBe,
]

async function main() {
  console.log('\n\u{1F1EB}\u{1F1F7}\u{1F1E7}\u{1F1EA} Emerge Pipeline \u2014 France & Belgium Sources Test')
  console.log(`   Base: Paris (${PARIS.lat}, ${PARIS.lng}) | Radius: ${PARIS.radiusKm}km\n`)

  let totalFetched = 0
  let totalScored = 0

  for (const source of sources) {
    const start = Date.now()
    let events: RawEvent[] = []

    console.log(`\u{1F4E1} ${source.name.toUpperCase()}`)

    try {
      events = await source.fetch(PARIS)
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
  console.log(`\u{1F4CA} FRANCE & BELGIUM SUMMARY`)
  console.log(`   Sources: ${sources.length}`)
  console.log(`   Events fetched: ${totalFetched}`)
  console.log(`   Events scored: ${totalScored}\n`)
}

main().catch(console.error)
