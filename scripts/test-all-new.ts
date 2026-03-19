/**
 * Test all new sources from this session: PT, DE, NL, UK + Petal sources.
 */
// Portuguese
import { gaiaPt } from '../src/pipeline/sources/gaia-pt'
import { redeConvergirPt } from '../src/pipeline/sources/rede-convergir-pt'
import { tameraPt } from '../src/pipeline/sources/tamera-pt'
import { terraAltaPt } from '../src/pipeline/sources/terra-alta-pt'
import { freixoMeioPt } from '../src/pipeline/sources/freixo-meio-pt'
import { lugarDaTerraPt } from '../src/pipeline/sources/lugar-da-terra-pt'
import { aldeiaDoValePt } from '../src/pipeline/sources/aldeia-do-vale-pt'
import { coopernicoPt } from '../src/pipeline/sources/coopernico-pt'
import { fablabLisboaPt } from '../src/pipeline/sources/fablab-lisboa-pt'
import { transicaoPt } from '../src/pipeline/sources/transicao-pt'
import { convergenciaPt } from '../src/pipeline/sources/convergencia-pt'
import { biovillaPt } from '../src/pipeline/sources/biovilla-pt'
import { regenerarPt } from '../src/pipeline/sources/regenerar-pt'
import { aldeiasXistoPt } from '../src/pipeline/sources/aldeias-xisto-pt'
// German (new)
import { permakulturAkademieDe } from '../src/pipeline/sources/permakultur-akademie-de'
import { permakulturLwDe } from '../src/pipeline/sources/permakultur-lw-de'
import { bundDe } from '../src/pipeline/sources/bund-de'
import { zeggDe } from '../src/pipeline/sources/zegg-de'
import { energiegenossenschaftenDe } from '../src/pipeline/sources/energiegenossenschaften-de'
import { degrowthDe } from '../src/pipeline/sources/degrowth-de'
import { syndikatDe } from '../src/pipeline/sources/syndikat-de'
// Dutch (new)
import { toekomstboerenNl } from '../src/pipeline/sources/toekomstboeren-nl'
import { agroecologyNl } from '../src/pipeline/sources/agroecology-nl'
import { ivnNl } from '../src/pipeline/sources/ivn-nl'
import { hierOpgewektNl } from '../src/pipeline/sources/hier-opgewekt-nl'
import { biodynamischNl } from '../src/pipeline/sources/biodynamisch-nl'
import { donutAmsterdamNl } from '../src/pipeline/sources/donut-amsterdam-nl'
import { commonlandNl } from '../src/pipeline/sources/commonland-nl'
// UK (new)
import { tcvUk } from '../src/pipeline/sources/tcv-uk'
import { woodlandTrustUk } from '../src/pipeline/sources/woodland-trust-uk'
import { growingCommunitiesUk } from '../src/pipeline/sources/growing-communities-uk'
import { biodynamicUk } from '../src/pipeline/sources/biodynamic-uk'
import { cohousingUk } from '../src/pipeline/sources/cohousing-uk'
import { schumacherUk } from '../src/pipeline/sources/schumacher-uk'
import { catUk } from '../src/pipeline/sources/cat-uk'
import { goodGriefUk } from '../src/pipeline/sources/good-grief-uk'
import { wenUk } from '../src/pipeline/sources/wen-uk'
import { weallGlobal } from '../src/pipeline/sources/weall-global'
import { cltUk } from '../src/pipeline/sources/clt-uk'

const groups = {
  'Portugal': [gaiaPt, redeConvergirPt, tameraPt, terraAltaPt, freixoMeioPt, lugarDaTerraPt, aldeiaDoValePt, coopernicoPt, fablabLisboaPt, transicaoPt, convergenciaPt, biovillaPt, regenerarPt, aldeiasXistoPt],
  'Germany (new)': [permakulturAkademieDe, permakulturLwDe, bundDe, zeggDe, energiegenossenschaftenDe, degrowthDe, syndikatDe],
  'Netherlands (new)': [toekomstboerenNl, agroecologyNl, ivnNl, hierOpgewektNl, biodynamischNl, donutAmsterdamNl, commonlandNl],
  'UK (new)': [tcvUk, woodlandTrustUk, growingCommunitiesUk, biodynamicUk, cohousingUk, schumacherUk, catUk, goodGriefUk, wenUk, weallGlobal, cltUk],
}

const cities = [
  { name: 'London', lat: 51.5074, lng: -0.1278, radiusKm: 100 },
  { name: 'Berlin', lat: 52.5200, lng: 13.4050, radiusKm: 100 },
  { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, radiusKm: 100 },
  { name: 'Lisbon', lat: 38.7169, lng: -9.1393, radiusKm: 100 },
]

async function main() {
  let grandTotal = 0

  for (const [group, sources] of Object.entries(groups)) {
    console.log(`\n=== ${group} (${sources.length} sources) ===`)
    for (const src of sources) {
      try {
        const events = await src.fetch({ lat: 51.5, lng: 0, radiusKm: 500 })
        grandTotal += events.length
        const icon = events.length > 0 ? '✅' : '⚪'
        console.log(`${icon} ${src.name}: ${events.length}${events[0] ? ` — "${events[0].title}"` : ''}`)
      } catch (err: any) {
        console.log(`❌ ${src.name}: ${err.message?.slice(0, 60)}`)
      }
    }
  }

  console.log(`\n=== GRAND TOTAL: ${grandTotal} events from ${Object.values(groups).flat().length} new sources ===`)

  // City test
  console.log('\n=== By City ===')
  for (const city of cities) {
    let total = 0
    const hits: string[] = []
    for (const sources of Object.values(groups)) {
      for (const src of sources) {
        try {
          const ev = await src.fetch(city)
          if (ev.length > 0) { total += ev.length; hits.push(`${src.name}(${ev.length})`) }
        } catch {}
      }
    }
    console.log(`📍 ${city.name}: ${total} events — ${hits.join(', ') || 'none'}`)
  }
}

main().catch(console.error)
