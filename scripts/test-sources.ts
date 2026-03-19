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

import { inaturalist } from '../src/pipeline/sources/inaturalist'
import { repairCafe } from '../src/pipeline/sources/repair-cafe'
import { wwoof } from '../src/pipeline/sources/wwoof'
import { ecovillage } from '../src/pipeline/sources/ecovillage'
import { telegram } from '../src/pipeline/sources/telegram'
import { eupn } from '../src/pipeline/sources/eupn'
import { permacultureUk } from '../src/pipeline/sources/permaculture-uk'
import { colibrisFr } from '../src/pipeline/sources/colibris-fr'
import { mundraubDe } from '../src/pipeline/sources/mundraub-de'
import { incredibleEdibleUk } from '../src/pipeline/sources/incredible-edible-uk'
import { permaculturaEs } from '../src/pipeline/sources/permacultura-es'
import { permacultureFr } from '../src/pipeline/sources/permaculture-fr'
import { transitieNl } from '../src/pipeline/sources/transitie-nl'
import type { SourceFetcher } from '../src/pipeline/sources/types'

const LISBON = { lat: 38.7169, lng: -9.1393, radiusKm: 50 }

const sources: SourceFetcher[] = [
  inaturalist, repairCafe, wwoof, ecovillage, telegram,
  eupn, permacultureUk, colibrisFr, mundraubDe, incredibleEdibleUk,
  permaculturaEs, permacultureFr, transitieNl,
]

async function main() {
  console.log('\n\u{1F30D} Emerge Pipeline \u2014 All 13 Sources Test')
  console.log(`   Location: Lisbon (${LISBON.lat}, ${LISBON.lng}) | Radius: ${LISBON.radiusKm}km`)
  console.log(`   Mode: FETCH ONLY (no AI scoring)\n`)

  let totalFetched = 0
  const results: Array<{ source: string; count: number; status: string; titles: string[] }> = []

  for (const source of sources) {
    const start = Date.now()
    let events: any[] = []
    let status = ''

    try {
      events = await source.fetch(LISBON)
      const ms = Date.now() - start
      status = events.length > 0 ? `\u2705 ${events.length} events (${ms}ms)` : `\u26A0\uFE0F  0 events (${ms}ms)`
      totalFetched += events.length
    } catch (err) {
      status = `\u274C Error: ${(err as Error).message.slice(0, 60)}`
    }

    const titles = events.slice(0, 3).map((e: any) => e.title)
    results.push({ source: source.name, count: events.length, status, titles })

    console.log(`${source.name.toUpperCase().padEnd(22)} ${status}`)
    for (const t of titles) {
      console.log(`${''.padEnd(22)}   \u2022 ${t.slice(0, 70)}`)
    }
    if (events.length > 3) console.log(`${''.padEnd(22)}   ... and ${events.length - 3} more`)
  }

  console.log('\n' + '\u2500'.repeat(65))
  console.log(`\u{1F4CA} SUMMARY`)
  console.log(`   Sources tested:  ${sources.length}`)
  console.log(`   With events:     ${results.filter(r => r.count > 0).length}`)
  console.log(`   Empty:           ${results.filter(r => r.count === 0).length}`)
  console.log(`   Total events:    ${totalFetched}`)

  console.log('\n   STATUS BY SOURCE:')
  for (const r of results) {
    const icon = r.count > 0 ? '\u2705' : r.status.includes('\u274C') ? '\u274C' : '\u26A0\uFE0F'
    console.log(`   ${icon} ${r.source.padEnd(22)} ${r.count} events`)
  }
  console.log()
}

main().catch(console.error)
