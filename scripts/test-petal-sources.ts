/**
 * Test the 16 new Permaculture Flower petal sources.
 * Fetches from each, reports what returns data.
 */
import { agroecologyEu } from '../src/pipeline/sources/agroecology-eu'
import { rewildingEu } from '../src/pipeline/sources/rewilding-eu'
import { ossSeeds } from '../src/pipeline/sources/oss-seeds'
import { cohousingEu } from '../src/pipeline/sources/cohousing-eu'
import { rescoopEu } from '../src/pipeline/sources/rescoop-eu'
import { fablabGlobal } from '../src/pipeline/sources/fablab-global'
import { cultureDeclares } from '../src/pipeline/sources/culture-declares'
import { artivistNet } from '../src/pipeline/sources/artivist-net'
import { wtrEu } from '../src/pipeline/sources/wtr-eu'
import { cpaGlobal } from '../src/pipeline/sources/cpa-global'
import { ripessEu } from '../src/pipeline/sources/ripess-eu'
import { dealGlobal } from '../src/pipeline/sources/deal-global'
import { timebanksEu } from '../src/pipeline/sources/timebanks-eu'
import { stopEcocide } from '../src/pipeline/sources/stop-ecocide'
import { terredeliensEu } from '../src/pipeline/sources/terredeliens-eu'
import { cltEu } from '../src/pipeline/sources/clt-eu'

const sources = [
  agroecologyEu, rewildingEu, ossSeeds, cohousingEu,
  rescoopEu, fablabGlobal, cultureDeclares, artivistNet,
  wtrEu, cpaGlobal, ripessEu, dealGlobal,
  timebanksEu, stopEcocide, terredeliensEu, cltEu,
]

// Test across 5 cities
const cities = [
  { name: 'London', lat: 51.5074, lng: -0.1278, radiusKm: 100 },
  { name: 'Berlin', lat: 52.5200, lng: 13.4050, radiusKm: 100 },
  { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, radiusKm: 100 },
  { name: 'Paris', lat: 48.8566, lng: 2.3522, radiusKm: 100 },
  { name: 'Lisbon', lat: 38.7169, lng: -9.1393, radiusKm: 100 },
]

async function main() {
  console.log('=== Testing 16 Permaculture Flower Petal Sources ===\n')

  // First test all sources globally
  let totalEvents = 0
  const sourceResults: { name: string; count: number; sample?: string }[] = []

  for (const src of sources) {
    try {
      const events = await src.fetch({ lat: 51.5, lng: 0, radiusKm: 500 })
      totalEvents += events.length
      sourceResults.push({
        name: src.name,
        count: events.length,
        sample: events[0]?.title,
      })
      const icon = events.length > 0 ? '✅' : '⚪'
      console.log(`${icon} ${src.name}: ${events.length} events${events[0] ? ` — "${events[0].title}"` : ''}`)
    } catch (err: any) {
      sourceResults.push({ name: src.name, count: -1 })
      console.log(`❌ ${src.name}: ERROR — ${err.message?.slice(0, 80)}`)
    }
  }

  console.log(`\n--- TOTALS ---`)
  const working = sourceResults.filter(s => s.count > 0).length
  const empty = sourceResults.filter(s => s.count === 0).length
  const errored = sourceResults.filter(s => s.count < 0).length
  console.log(`Working: ${working} | Empty: ${empty} | Errored: ${errored} | Total events: ${totalEvents}`)

  // City breakdown
  console.log('\n=== Events by City (top 3 sources only) ===\n')
  for (const city of cities) {
    let cityTotal = 0
    const top: { name: string; count: number }[] = []
    for (const src of sources) {
      try {
        const events = await src.fetch(city)
        cityTotal += events.length
        if (events.length > 0) top.push({ name: src.name, count: events.length })
      } catch {}
    }
    top.sort((a, b) => b.count - a.count)
    console.log(`📍 ${city.name}: ${cityTotal} events`)
    for (const t of top.slice(0, 3)) {
      console.log(`   ${t.name}: ${t.count}`)
    }
  }
}

main().catch(console.error)
