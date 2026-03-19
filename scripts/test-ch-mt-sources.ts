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

import { communitiesCh } from '../src/pipeline/sources/communities-ch'
import { transitionZh } from '../src/pipeline/sources/transition-zh'
import { transitionCh } from '../src/pipeline/sources/transition-ch'
import { glariseggCh } from '../src/pipeline/sources/glarisegg-ch'
import { regenZh } from '../src/pipeline/sources/regen-zh'
import { biosuisseCh } from '../src/pipeline/sources/biosuisse-ch'
import { permacultureCh } from '../src/pipeline/sources/permaculture-ch'
import { transitionMt } from '../src/pipeline/sources/transition-mt'
import { foeMt } from '../src/pipeline/sources/foe-mt'
import { greenMt } from '../src/pipeline/sources/green-mt'
import { naturetrustMt } from '../src/pipeline/sources/naturetrust-mt'
import { scoreQuest } from '../src/pipeline/score-quest'
import type { SourceFetcher, RawEvent } from '../src/pipeline/sources/types'

const ZURICH = { lat: 47.3769, lng: 8.5417, radiusKm: 200 }
const MALTA = { lat: 35.9375, lng: 14.3754, radiusKm: 50 }

const chSources: SourceFetcher[] = [
  communitiesCh, transitionZh, transitionCh, glariseggCh, regenZh, biosuisseCh, permacultureCh,
]
const mtSources: SourceFetcher[] = [
  transitionMt, foeMt, greenMt, naturetrustMt,
]

async function testRegion(label: string, sources: SourceFetcher[], coords: typeof ZURICH) {
  console.log(`\n${label}`)
  console.log(`   Base: (${coords.lat}, ${coords.lng}) | Radius: ${coords.radiusKm}km\n`)

  let fetched = 0, scored = 0

  for (const source of sources) {
    const start = Date.now()
    let events: RawEvent[] = []
    console.log(`\u{1F4E1} ${source.name.toUpperCase()}`)
    try {
      events = await source.fetch(coords)
      console.log(`   Fetched: ${events.length} events (${Date.now() - start}ms)`)
      fetched += events.length
    } catch (err) {
      console.log(`   \u274C Error: ${(err as Error).message.slice(0, 80)}`)
      console.log(); continue
    }
    if (events.length === 0) { console.log(`   (no events)\n`); continue }

    for (const event of events.slice(0, 2)) {
      try {
        const s = await scoreQuest({ title: event.title, description: event.description, location: event.location_name })
        scored++
        const bar = '\u2588'.repeat(Math.round(s.ai_score / 5)) + '\u2591'.repeat(20 - Math.round(s.ai_score / 5))
        console.log(`   ${s.ai_score >= 50 ? '\u2705' : '\u274C'} ${s.ai_score}/100 [${bar}] [${s.category}]`)
        console.log(`      "${event.title.slice(0, 70)}"`)
        console.log(`      ${s.ai_reasoning}`)
      } catch (err) { console.log(`   \u26A0\uFE0F  Score failed: ${(err as Error).message.slice(0, 60)}`) }
    }
    if (events.length > 2) console.log(`   ... and ${events.length - 2} more`)
    console.log()
  }
  return { fetched, scored }
}

async function main() {
  console.log('\u{1F1E8}\u{1F1ED}\u{1F1F2}\u{1F1F9} Emerge Pipeline \u2014 Switzerland & Malta Test')

  const ch = await testRegion('\u{1F1E8}\u{1F1ED} SWITZERLAND', chSources, ZURICH)
  const mt = await testRegion('\u{1F1F2}\u{1F1F9} MALTA', mtSources, MALTA)

  console.log('\u2500'.repeat(60))
  console.log(`\u{1F4CA} TOTAL: ${ch.fetched + mt.fetched} events fetched, ${ch.scored + mt.scored} scored\n`)
}

main().catch(console.error)
