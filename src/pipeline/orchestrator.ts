/**
 * Pipeline orchestrator — runs all source fetchers, scores events with AI,
 * deduplicates, and inserts passing events into Supabase.
 */
import type { RawEvent, SourceFetcher } from './sources/types'
import { inaturalist } from './sources/inaturalist'
import { repairCafe } from './sources/repair-cafe'
import { wwoof } from './sources/wwoof'
import { ecovillage } from './sources/ecovillage'
import { telegram } from './sources/telegram'
import { eupn } from './sources/eupn'
import { permacultureUk } from './sources/permaculture-uk'
import { colibrisFr } from './sources/colibris-fr'
import { mundraubDe } from './sources/mundraub-de'
import { incredibleEdibleUk } from './sources/incredible-edible-uk'
import { permaculturaEs } from './sources/permacultura-es'
import { permacultureFr } from './sources/permaculture-fr'
import { transitieNl } from './sources/transitie-nl'
import { nationalTrustUk } from './sources/national-trust-uk'
import { permablitzUk } from './sources/permablitz-uk'
import { landworkersUk } from './sources/landworkers-uk'
import { rewildingUk } from './sources/rewilding-uk'
import { permakulturDe } from './sources/permakultur-de'
import { transitionDe } from './sources/transition-de'
import { foodsharingDe } from './sources/foodsharing-de'
import { solawiDe } from './sources/solawi-de'
import { zukunftsorteDe } from './sources/zukunftsorte-de'
import { siebenLindenDe } from './sources/sieben-linden-de'
import { permacultuurNl } from './sources/permacultuur-nl'
import { herenborenNl } from './sources/herenboeren-nl'
import { voedselbosNl } from './sources/voedselbos-nl'
import { repaircafeNl } from './sources/repaircafe-nl'
import { ficNa } from './sources/fic-na'
import { priUsa } from './sources/pri-usa'
import { transitionUs } from './sources/transition-us'
import { transitionCa } from './sources/transition-ca'
import { rodaleUsa } from './sources/rodale-usa'
import { wwoofUsa, wwoofCa } from './sources/wwoof-na'
import { ercNa } from './sources/erc-na'
import { transitionEs } from './sources/transition-es'
import { ecoaldeasEs } from './sources/ecoaldeas-es'
import { resilienceEs } from './sources/resilience-es'
import { huertosEs } from './sources/huertos-es'
import { permaculturaIt } from './sources/permacultura-it'
import { riveIt } from './sources/rive-it'
import { transitionIt } from './sources/transition-it'
import { damanhurIt } from './sources/damanhur-it'
import { incroyablesFr } from './sources/incroyables-fr'
import { transitionFr } from './sources/transition-fr'
import { terredeliensFr } from './sources/terredeliens-fr'
import { amapFr } from './sources/amap-fr'
import { transitieBe } from './sources/transitie-be'
import { transitionWallonieBe } from './sources/transition-wallonie-be'
import { permacultuurBe } from './sources/permacultuur-be'
import { csaBe } from './sources/csa-be'
import { csaWallonieBe } from './sources/csa-wallonie-be'
import { communitiesCh } from './sources/communities-ch'
import { transitionZh } from './sources/transition-zh'
import { transitionCh } from './sources/transition-ch'
import { glariseggCh } from './sources/glarisegg-ch'
import { regenZh } from './sources/regen-zh'
import { biosuisseCh } from './sources/biosuisse-ch'
import { permacultureCh } from './sources/permaculture-ch'
import { transitionMt } from './sources/transition-mt'
import { foeMt } from './sources/foe-mt'
import { greenMt } from './sources/green-mt'
import { naturetrustMt } from './sources/naturetrust-mt'
import { eupnGlobal } from './sources/eupn-global'
import { permacultureGlobal } from './sources/permaculture-global'
import { regenInternational } from './sources/regen-international'
import { ercGlobal } from './sources/erc-global'
import { workawayGlobal } from './sources/workaway-global'
import { helpxGlobal } from './sources/helpx-global'
import { wwoofGlobal } from './sources/wwoof-global'
import { ficGlobal } from './sources/fic-global'
import { genGathering } from './sources/gen-gathering'
import { edeGlobal } from './sources/ede-global'
import { priGlobal } from './sources/pri-global'
import { slowfoodGlobal } from './sources/slowfood-global'
import { navdanyaGlobal } from './sources/navdanya-global'
import { localFuturesGlobal } from './sources/local-futures-global'
// Petal 1 — Land & Nature Stewardship
import { agroecologyEu } from './sources/agroecology-eu'
import { rewildingEu } from './sources/rewilding-eu'
import { ossSeeds } from './sources/oss-seeds'
// Petal 2 — Building
import { cohousingEu } from './sources/cohousing-eu'
// Petal 3 — Tools & Technology
import { rescoopEu } from './sources/rescoop-eu'
import { fablabGlobal } from './sources/fablab-global'
// Petal 4 — Education & Culture
import { cultureDeclares } from './sources/culture-declares'
import { artivistNet } from './sources/artivist-net'
// Petal 5 — Health & Wellbeing
import { wtrEu } from './sources/wtr-eu'
import { cpaGlobal } from './sources/cpa-global'
// Petal 6 — Finance & Economy
import { ripessEu } from './sources/ripess-eu'
import { dealGlobal } from './sources/deal-global'
import { timebanksEu } from './sources/timebanks-eu'
// Petal 7 — Land Tenure & Governance
import { stopEcocide } from './sources/stop-ecocide'
import { terredeliensEu } from './sources/terredeliens-eu'
import { cltEu } from './sources/clt-eu'
// Zero Waste
import { zeroWasteEu } from './sources/zero-waste-eu'
import { zeroWasteFr } from './sources/zero-waste-fr'
import { zeroWasteDe } from './sources/zero-waste-de'
import { zeroWasteBe } from './sources/zero-waste-be'
import { rezeroEs } from './sources/rezero-es'
import { recyclingNetwerkBe } from './sources/recycling-netwerk-be'
import { hubbubUk } from './sources/hubbub-uk'
import { zeroWasteUsa } from './sources/zero-waste-usa'
import { olioGlobal } from './sources/olio-global'
import { zeroWastePt } from './sources/zero-waste-pt'
import { puschCh } from './sources/pusch-ch'
import { zeroWasteDayGlobal } from './sources/zero-waste-day-global'
// Theatre of the Oppressed
import { stopLondonUk } from './sources/stop-london-uk'
import { kuringaDe } from './sources/kuringa-de'
import { itoGlobal } from './sources/ito-global'
import { tonycUsa } from './sources/tonyc-usa'
// Birth & Midwifery Circles
import { positiveBirthUk } from './sources/positive-birth-uk'
import { birthcircleGlobal } from './sources/birthcircle-global'
// Participatory Music & Arts
import { naturalVoiceUk } from './sources/natural-voice-uk'
import { iptnGlobal } from './sources/iptn-global'
import { theSessionGlobal } from './sources/thesession-global'
import { balfolkEu } from './sources/balfolk-eu'
import { fasolaGlobal } from './sources/fasola-global'
// Ecological & Community Art
import { resartisGlobal } from './sources/resartis-global'
// Irish Play & Make
import { comhaltasIe } from './sources/comhaltas-ie'
import { artscouncilIe } from './sources/artscouncil-ie'
// Spanish Play & Make
import { esArtSpaces } from './sources/es-art-spaces'
// Dutch Play & Make
import { nlArtSpaces } from './sources/nl-art-spaces'
// French Play & Make
import { frArtSpaces } from './sources/fr-art-spaces'
// German Play & Make
import { deArtSpaces } from './sources/de-art-spaces'
// Portuguese Play & Make
import { agendaCulturalPt } from './sources/agenda-cultural-pt'
import { ptArtSpaces } from './sources/pt-art-spaces'
// UK Play & Make
import { efdssUk } from './sources/efdss-uk'
import { balfolkUk } from './sources/balfolk-uk'
import { ukArtSpaces } from './sources/uk-art-spaces'
// Community Orchards
import { orchardProjectUk } from './sources/orchard-project-uk'
import { appleDayUk } from './sources/apple-day-uk'
import { phillyOrchardUsa } from './sources/philly-orchard-usa'
import { portlandFruitUsa } from './sources/portland-fruit-usa'
// Community Kitchens
import { discoSoupeFr } from './sources/disco-soupe-fr'
import { schnippeldiskoDe } from './sources/schnippeldisko-de'
import { foodcycleUk } from './sources/foodcycle-uk'
import { realJunkFoodUk } from './sources/real-junk-food-uk'
// UK (Oxford)
import { orfcUk } from './sources/orfc-uk'
import { cultivateOxfordUk } from './sources/cultivate-oxford-uk'
// USA (new)
import { permacultureActionUsa } from './sources/permaculture-action-usa'
import { biodynamicsUsa } from './sources/biodynamics-usa'
import { agrarianTrustUsa } from './sources/agrarian-trust-usa'
import { slowMoneyUsa } from './sources/slow-money-usa'
import { goodGriefUsa } from './sources/good-grief-usa'
// Canada (new)
import { ourEcovillageCa } from './sources/our-ecovillage-ca'
import { pinaCa } from './sources/pina-ca'
import { ecologyActionCa } from './sources/ecology-action-ca'
import { seedLibrariesCa } from './sources/seed-libraries-ca'
import { farmfolkCa } from './sources/farmfolk-ca'
import { csaCa } from './sources/csa-ca'
// Malta (new)
import { birdlifeMt } from './sources/birdlife-mt'
import { moamMt } from './sources/moam-mt'
// Switzerland (new)
import { regenerativCh } from './sources/regenerativ-ch'
import { biovisionCh } from './sources/biovision-ch'
import { agroecologyWorksCh } from './sources/agroecology-works-ch'
// Italy (new)
import { aiabIt } from './sources/aiab-it'
import { slowfoodIt } from './sources/slowfood-it'
import { cohousingIt } from './sources/cohousing-it'
import { gasIt } from './sources/gas-it'
import { campagnaAmicaIt } from './sources/campagna-amica-it'
// Spain (new)
import { seaeEs } from './sources/seae-es'
import { agriRegenEs } from './sources/agri-regen-es'
import { semillasEs } from './sources/semillas-es'
import { reasEs } from './sources/reas-es'
import { cicEs } from './sources/cic-es'
// Belgium (new)
import { natagoraBe } from './sources/natagora-be'
import { vitaleRassenBe } from './sources/vitale-rassen-be'
import { fetePossiblesBe } from './sources/fete-possibles-be'
import { permaProjectsBe } from './sources/perma-projects-be'
import { financiteBe } from './sources/financite-be'
// France (new)
import { miramapFr } from './sources/miramap-fr'
import { semencesFr } from './sources/semences-fr'
import { compaillonsFr } from './sources/compaillons-fr'
import { enercoopFr } from './sources/enercoop-fr'
import { repaircafeFr } from './sources/repaircafe-fr'
import { passerellecoFr } from './sources/passerelleco-fr'
import { monnaiesLocalesFr } from './sources/monnaies-locales-fr'
import { alternatibaFr } from './sources/alternatiba-fr'
// UK (new)
import { tcvUk } from './sources/tcv-uk'
import { woodlandTrustUk } from './sources/woodland-trust-uk'
import { growingCommunitiesUk } from './sources/growing-communities-uk'
import { biodynamicUk } from './sources/biodynamic-uk'
import { cohousingUk } from './sources/cohousing-uk'
import { schumacherUk } from './sources/schumacher-uk'
import { catUk } from './sources/cat-uk'
import { goodGriefUk } from './sources/good-grief-uk'
import { wenUk } from './sources/wen-uk'
import { weallGlobal } from './sources/weall-global'
import { cltUk } from './sources/clt-uk'
// Netherlands (new)
import { toekomstboerenNl } from './sources/toekomstboeren-nl'
import { agroecologyNl } from './sources/agroecology-nl'
import { ivnNl } from './sources/ivn-nl'
import { hierOpgewektNl } from './sources/hier-opgewekt-nl'
import { biodynamischNl } from './sources/biodynamisch-nl'
import { donutAmsterdamNl } from './sources/donut-amsterdam-nl'
import { commonlandNl } from './sources/commonland-nl'
// Germany (new)
import { permakulturAkademieDe } from './sources/permakultur-akademie-de'
import { permakulturLwDe } from './sources/permakultur-lw-de'
import { bundDe } from './sources/bund-de'
import { zeggDe } from './sources/zegg-de'
import { energiegenossenschaftenDe } from './sources/energiegenossenschaften-de'
import { degrowthDe } from './sources/degrowth-de'
import { syndikatDe } from './sources/syndikat-de'
// Portugal
import { gaiaPt } from './sources/gaia-pt'
import { redeConvergirPt } from './sources/rede-convergir-pt'
import { tameraPt } from './sources/tamera-pt'
import { terraAltaPt } from './sources/terra-alta-pt'
import { freixoMeioPt } from './sources/freixo-meio-pt'
import { lugarDaTerraPt } from './sources/lugar-da-terra-pt'
import { aldeiaDoValePt } from './sources/aldeia-do-vale-pt'
import { coopernicoPt } from './sources/coopernico-pt'
import { fablabLisboaPt } from './sources/fablab-lisboa-pt'
import { transicaoPt } from './sources/transicao-pt'
import { convergenciaPt } from './sources/convergencia-pt'
import { biovillaPt } from './sources/biovilla-pt'
import { regenerarPt } from './sources/regenerar-pt'
import { aldeiasXistoPt } from './sources/aldeias-xisto-pt'
// City-based scrapers (Meetup + Eventbrite across 50 cities)
import { meetupCities } from './sources/meetup-cities'
import { eventbriteCities } from './sources/eventbrite-cities'
import { localNetworks } from './sources/local-networks'
import { eventbriteApi } from './sources/eventbrite-api'
// Diaspora cultural feast sources
import { eventbriteCultural } from './sources/eventbrite-cultural'
import { alleventsCultural } from './sources/allevents-cultural'
// Federated event platforms (ActivityPub / GraphQL, free, no auth)
import { mobilizon } from './sources/mobilizon'
// Ticketing platform scrapers — ALL DISABLED 2026-04-22
// After deep investigation, none of these 5 can be scraped from static HTML:
//   - dice:         Cloudflare 403 (bot-blocked at TLS level)
//   - ticketTailor: Cloudflare 403 (bot-blocked at TLS level)
//   - outsavvy:     returns 600 junk items titled "FREE" regardless of query
//   - humanitix:    site is a Next.js SPA; events load via private API, not in HTML
//   - billetto:     same as humanitix — SPA with client-side event loading
// Fixing any of these requires either (a) Playwright/headless browser (200MB+
// dependency, slow, brittle), or (b) a paid scraping service (€20+/mo).
// Files remain in src/pipeline/sources/ in case we revisit. See CLAUDE.md.
// import { ticketTailor } from './sources/ticket-tailor'
// import { humanitix } from './sources/humanitix'
// import { billetto } from './sources/billetto'
// import { outsavvy } from './sources/outsavvy'
// import { dice } from './sources/dice'
import { scoreQuest } from './score-quest'

// All registered source fetchers
const SOURCES: SourceFetcher[] = [
  inaturalist,
  repairCafe,
  wwoof,
  ecovillage,
  telegram,
  eupn,
  permacultureUk,
  colibrisFr,
  mundraubDe,
  incredibleEdibleUk,
  permaculturaEs,
  permacultureFr,
  transitieNl,
  nationalTrustUk,
  permablitzUk,
  landworkersUk,
  rewildingUk,
  permakulturDe,
  transitionDe,
  foodsharingDe,
  solawiDe,
  zukunftsorteDe,
  siebenLindenDe,
  permacultuurNl,
  herenborenNl,
  voedselbosNl,
  repaircafeNl,
  ficNa,
  priUsa,
  transitionUs,
  transitionCa,
  rodaleUsa,
  wwoofUsa,
  wwoofCa,
  ercNa,
  transitionEs,
  ecoaldeasEs,
  resilienceEs,
  huertosEs,
  permaculturaIt,
  riveIt,
  transitionIt,
  damanhurIt,
  incroyablesFr,
  transitionFr,
  terredeliensFr,
  amapFr,
  transitieBe,
  transitionWallonieBe,
  permacultuurBe,
  csaBe,
  csaWallonieBe,
  communitiesCh,
  transitionZh,
  transitionCh,
  glariseggCh,
  regenZh,
  biosuisseCh,
  permacultureCh,
  transitionMt,
  foeMt,
  greenMt,
  naturetrustMt,
  eupnGlobal,
  permacultureGlobal,
  regenInternational,
  ercGlobal,
  workawayGlobal,
  helpxGlobal,
  wwoofGlobal,
  ficGlobal,
  genGathering,
  edeGlobal,
  priGlobal,
  slowfoodGlobal,
  navdanyaGlobal,
  localFuturesGlobal,
  // Petal 1 — Land & Nature Stewardship
  agroecologyEu,
  rewildingEu,
  ossSeeds,
  // Petal 2 — Building
  cohousingEu,
  // Petal 3 — Tools & Technology
  rescoopEu,
  fablabGlobal,
  // Petal 4 — Education & Culture
  cultureDeclares,
  artivistNet,
  // Petal 5 — Health & Wellbeing
  wtrEu,
  cpaGlobal,
  // Petal 6 — Finance & Economy
  ripessEu,
  dealGlobal,
  timebanksEu,
  // Petal 7 — Land Tenure & Governance
  stopEcocide,
  terredeliensEu,
  cltEu,
  // Zero Waste
  zeroWasteEu,
  zeroWasteFr,
  zeroWasteDe,
  zeroWasteBe,
  rezeroEs,
  recyclingNetwerkBe,
  hubbubUk,
  zeroWasteUsa,
  olioGlobal,
  zeroWastePt,
  puschCh,
  zeroWasteDayGlobal,
  // Theatre of the Oppressed
  stopLondonUk,
  kuringaDe,
  itoGlobal,
  tonycUsa,
  // Birth & Midwifery Circles
  positiveBirthUk,
  birthcircleGlobal,
  // Participatory Music & Arts
  naturalVoiceUk,
  iptnGlobal,
  theSessionGlobal,
  balfolkEu,
  fasolaGlobal,
  resartisGlobal,
  comhaltasIe,
  artscouncilIe,
  esArtSpaces,
  nlArtSpaces,
  frArtSpaces,
  deArtSpaces,
  agendaCulturalPt,
  ptArtSpaces,
  efdssUk,
  balfolkUk,
  ukArtSpaces,
  // Community Orchards
  orchardProjectUk,
  appleDayUk,
  phillyOrchardUsa,
  portlandFruitUsa,
  // Community Kitchens
  discoSoupeFr,
  schnippeldiskoDe,
  foodcycleUk,
  realJunkFoodUk,
  // UK (Oxford)
  orfcUk,
  cultivateOxfordUk,
  // USA (new)
  permacultureActionUsa,
  biodynamicsUsa,
  agrarianTrustUsa,
  slowMoneyUsa,
  goodGriefUsa,
  // Canada (new)
  ourEcovillageCa,
  pinaCa,
  ecologyActionCa,
  seedLibrariesCa,
  farmfolkCa,
  csaCa,
  // Malta (new)
  birdlifeMt,
  moamMt,
  // Switzerland (new)
  regenerativCh,
  biovisionCh,
  agroecologyWorksCh,
  // Italy (new)
  aiabIt,
  slowfoodIt,
  cohousingIt,
  gasIt,
  campagnaAmicaIt,
  // Spain (new)
  seaeEs,
  agriRegenEs,
  semillasEs,
  reasEs,
  cicEs,
  // Belgium (new)
  natagoraBe,
  vitaleRassenBe,
  fetePossiblesBe,
  permaProjectsBe,
  financiteBe,
  // France (new)
  miramapFr,
  semencesFr,
  compaillonsFr,
  enercoopFr,
  repaircafeFr,
  passerellecoFr,
  monnaiesLocalesFr,
  alternatibaFr,
  // UK (new)
  tcvUk,
  woodlandTrustUk,
  growingCommunitiesUk,
  biodynamicUk,
  cohousingUk,
  schumacherUk,
  catUk,
  goodGriefUk,
  wenUk,
  weallGlobal,
  cltUk,
  // Netherlands (new)
  toekomstboerenNl,
  agroecologyNl,
  ivnNl,
  hierOpgewektNl,
  biodynamischNl,
  donutAmsterdamNl,
  commonlandNl,
  // Germany (new)
  permakulturAkademieDe,
  permakulturLwDe,
  bundDe,
  zeggDe,
  energiegenossenschaftenDe,
  degrowthDe,
  syndikatDe,
  // Portugal
  gaiaPt,
  redeConvergirPt,
  tameraPt,
  terraAltaPt,
  freixoMeioPt,
  lugarDaTerraPt,
  aldeiaDoValePt,
  coopernicoPt,
  fablabLisboaPt,
  transicaoPt,
  convergenciaPt,
  biovillaPt,
  regenerarPt,
  aldeiasXistoPt,
  // City-based scrapers
  meetupCities,
  eventbriteCities,
  eventbriteApi,
  localNetworks,
  // Diaspora cultural feast sources
  eventbriteCultural,
  alleventsCultural,
  // Federated event platforms (Mobilizon/ActivityPub)
  mobilizon,
  // Ticketing platforms: all disabled (see import block above)
]

export interface OrchestratorResult {
  source: string
  fetched: number
  scored: number
  inserted: number
  filtered: number
  errors: number
  events: Array<{
    title: string
    score: number
    category: string
    passed: boolean
  }>
}

interface OrchestratorOptions {
  scoreThreshold?: number
  dryRun?: boolean    // if true, skip Supabase insert
  supabase?: any      // Supabase client for inserts
  cacheOnly?: boolean // if true, skip scoring (cache raw events only)
}

/** Geocode an address string to lat/lng via Nominatim */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Emerge-Pipeline/1.0', 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { /* skip */ }
  return null
}

export async function runPipeline(opts: OrchestratorOptions = {}): Promise<OrchestratorResult[]> {
  const { scoreThreshold = 50, dryRun = false, supabase, cacheOnly = false } = opts
  const results: OrchestratorResult[] = []

  for (const source of SOURCES) {
    const result: OrchestratorResult = {
      source: source.name,
      fetched: 0,
      scored: 0,
      inserted: 0,
      filtered: 0,
      errors: 0,
      events: [],
    }

    // 1. Fetch events from source — no location filter, scrape everything
    let events: RawEvent[] = []
    try {
      events = await source.fetch({})
      result.fetched = events.length
    } catch (err) {
      console.error(`[${source.name}] Fetch failed:`, err)
      result.errors++
      results.push(result)
      continue
    }

    // 2. Geocode events with missing coordinates
    for (const event of events) {
      if ((event.lat === 0 && event.lng === 0) && event.location_name && event.location_name !== 'See event page') {
        const geo = await geocodeAddress(event.location_name)
        if (geo) {
          event.lat = geo.lat
          event.lng = geo.lng
        }
      }
    }
    // Filter out events that still have no coordinates after geocoding
    events = events.filter(e => !(e.lat === 0 && e.lng === 0))

    // If cacheOnly mode, skip scoring and just return fetched count
    if (cacheOnly) {
      results.push(result)
      continue
    }

    // 3. Score each event with AI
    for (const event of events) {
      try {
        const scored = await scoreQuest({
          title: event.title,
          description: event.description,
          location: event.location_name,
        })
        if (!scored) {
          result.errors++
          continue
        }
        result.scored++

        const passed = scored.ai_score >= scoreThreshold
        result.events.push({
          title: event.title,
          score: scored.ai_score,
          category: scored.category,
          passed,
        })

        if (!passed) {
          result.filtered++
          continue
        }

        // 3. Insert into Supabase (unless dry run)
        if (!dryRun && supabase) {
          const { error } = await supabase.from('quests').upsert(
            {
              title: event.title,
              description: event.description,
              category: scored.category,
              geog: `POINT(${event.lng} ${event.lat})`,
              address: event.location_name,
              starts_at: event.starts_at,
              ends_at: event.ends_at ?? null,
              source_url: event.source_url,
              source_name: event.source,
              ai_score: scored.ai_score,
              ai_reasoning: scored.ai_reasoning,
              image_url: event.image_url ?? null,
              max_participants: event.max_participants ?? null,
            },
            { onConflict: 'title,starts_at' }  // deduplicate by title + date
          )

          if (error) {
            console.error(`[${source.name}] Insert failed for "${event.title}":`, error.message)
            result.errors++
          } else {
            result.inserted++
          }
        } else {
          result.inserted++ // count as "would insert" in dry run
        }
      } catch (err) {
        console.error(`[${source.name}] Score failed for "${event.title}":`, err)
        result.errors++
      }
    }

    results.push(result)
  }

  return results
}
