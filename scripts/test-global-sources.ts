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

import { eupnGlobal } from '../src/pipeline/sources/eupn-global'
import { permacultureGlobal } from '../src/pipeline/sources/permaculture-global'
import { regenInternational } from '../src/pipeline/sources/regen-international'
import { ercGlobal } from '../src/pipeline/sources/erc-global'
import { workawayGlobal } from '../src/pipeline/sources/workaway-global'
import { helpxGlobal } from '../src/pipeline/sources/helpx-global'
import { wwoofGlobal } from '../src/pipeline/sources/wwoof-global'
import { ficGlobal } from '../src/pipeline/sources/fic-global'
import { genGathering } from '../src/pipeline/sources/gen-gathering'
import { edeGlobal } from '../src/pipeline/sources/ede-global'
import { priGlobal } from '../src/pipeline/sources/pri-global'
import { slowfoodGlobal } from '../src/pipeline/sources/slowfood-global'
import { scoreQuest } from '../src/pipeline/score-quest'
import type { SourceFetcher, RawEvent } from '../src/pipeline/sources/types'

const sources: SourceFetcher[] = [
  eupnGlobal, permacultureGlobal, regenInternational, ercGlobal,
  workawayGlobal, helpxGlobal, wwoofGlobal, ficGlobal,
  genGathering, edeGlobal, priGlobal, slowfoodGlobal,
]

const CITIES = [
  { name: 'London', lat: 51.5074, lng: -0.1278, radiusKm: 200 },
  { name: 'Berlin', lat: 52.5200, lng: 13.4050, radiusKm: 200 },
  { name: 'Lisbon', lat: 38.7169, lng: -9.1393, radiusKm: 100 },
  { name: 'New York', lat: 40.7128, lng: -74.0060, radiusKm: 300 },
  { name: 'Toronto', lat: 43.6532, lng: -79.3832, radiusKm: 200 },
]

async function main() {
  console.log('\n\u{1F30D} Emerge Pipeline \u2014 Global Sources Test (12 sources, 5 cities)\n')

  // Phase 1: Fetch from all sources using Lisbon as default
  const LISBON = { lat: 38.7169, lng: -9.1393, radiusKm: 500 }
  let totalFetched = 0
  let totalScored = 0
  const sourceResults: Array<{ name: string; count: number; titles: string[] }> = []

  for (const source of sources) {
    const start = Date.now()
    let events: RawEvent[] = []

    console.log(`\u{1F4E1} ${source.name.toUpperCase()}`)
    try {
      events = await source.fetch(LISBON)
      const ms = Date.now() - start
      console.log(`   Fetched: ${events.length} events (${ms}ms)`)
      totalFetched += events.length
    } catch (err) {
      console.log(`   \u274C Error: ${(err as Error).message.slice(0, 80)}`)
      sourceResults.push({ name: source.name, count: 0, titles: [] })
      console.log(); continue
    }

    sourceResults.push({ name: source.name, count: events.length, titles: events.slice(0, 2).map(e => e.title.slice(0, 60)) })

    if (events.length === 0) { console.log(`   (no events)\n`); continue }

    // Score top 2
    for (const event of events.slice(0, 2)) {
      try {
        const s = await scoreQuest({ title: event.title, description: event.description, location: event.location_name })
        totalScored++
        const bar = '\u2588'.repeat(Math.round(s.ai_score / 5)) + '\u2591'.repeat(20 - Math.round(s.ai_score / 5))
        console.log(`   ${s.ai_score >= 50 ? '\u2705' : '\u274C'} ${s.ai_score}/100 [${bar}] [${s.category}]`)
        console.log(`      "${event.title.slice(0, 70)}"`)
        console.log(`      ${s.ai_reasoning}`)
      } catch (err) { console.log(`   \u26A0\uFE0F  Score failed: ${(err as Error).message.slice(0, 60)}`) }
    }
    if (events.length > 2) console.log(`   ... and ${events.length - 2} more`)
    console.log()
  }

  // Summary
  console.log('\u2500'.repeat(65))
  console.log(`\u{1F4CA} GLOBAL SUMMARY`)
  console.log(`   Sources tested:  ${sources.length}`)
  console.log(`   With events:     ${sourceResults.filter(r => r.count > 0).length}`)
  console.log(`   Total fetched:   ${totalFetched}`)
  console.log(`   Total scored:    ${totalScored}`)

  console.log('\n   BY SOURCE:')
  for (const r of sourceResults) {
    const icon = r.count > 0 ? '\u2705' : '\u26A0\uFE0F'
    console.log(`   ${icon} ${r.name.padEnd(24)} ${r.count} events`)
    for (const t of r.titles) console.log(`      \u2022 ${t}`)
  }
  console.log()
}

main().catch(console.error)
