/**
 * Test new French + Belgian sources with Paris and Brussels coordinates.
 */
// France (new)
import { miramapFr } from '../src/pipeline/sources/miramap-fr'
import { semencesFr } from '../src/pipeline/sources/semences-fr'
import { compaillonsFr } from '../src/pipeline/sources/compaillons-fr'
import { enercoopFr } from '../src/pipeline/sources/enercoop-fr'
import { repaircafeFr } from '../src/pipeline/sources/repaircafe-fr'
import { passerellecoFr } from '../src/pipeline/sources/passerelleco-fr'
import { monnaiesLocalesFr } from '../src/pipeline/sources/monnaies-locales-fr'
import { alternatibaFr } from '../src/pipeline/sources/alternatiba-fr'
// Belgium (new)
import { natagoraBe } from '../src/pipeline/sources/natagora-be'
import { vitaleRassenBe } from '../src/pipeline/sources/vitale-rassen-be'
import { fetePossiblesBe } from '../src/pipeline/sources/fete-possibles-be'
import { permaProjectsBe } from '../src/pipeline/sources/perma-projects-be'
import { financiteBe } from '../src/pipeline/sources/financite-be'

const sources = [
  miramapFr, semencesFr, compaillonsFr, enercoopFr, repaircafeFr,
  passerellecoFr, monnaiesLocalesFr, alternatibaFr,
  natagoraBe, vitaleRassenBe, fetePossiblesBe, permaProjectsBe, financiteBe,
]

async function main() {
  console.log('=== Testing 8 French + 5 Belgian sources ===\n')
  let total = 0
  for (const src of sources) {
    try {
      const ev = await src.fetch({ lat: 48.8, lng: 2.3, radiusKm: 500 })
      total += ev.length
      const icon = ev.length > 0 ? '✅' : '⚪'
      console.log(`${icon} ${src.name}: ${ev.length}${ev[0] ? ` — "${ev[0].title}"` : ''}`)
    } catch (err: any) {
      console.log(`❌ ${src.name}: ${err.message?.slice(0, 60)}`)
    }
  }
  console.log(`\nTotal: ${total} events from ${sources.length} sources`)

  // City test
  const cities = [
    { name: 'Paris', lat: 48.8566, lng: 2.3522, radiusKm: 100 },
    { name: 'Brussels', lat: 50.8503, lng: 4.3517, radiusKm: 100 },
  ]
  for (const city of cities) {
    let ct = 0
    const hits: string[] = []
    for (const src of sources) {
      try {
        const ev = await src.fetch(city)
        if (ev.length > 0) { ct += ev.length; hits.push(`${src.name}(${ev.length})`) }
      } catch {}
    }
    console.log(`📍 ${city.name}: ${ct} events — ${hits.join(', ') || 'none'}`)
  }
}
main().catch(console.error)
