/**
 * City-specific local network scrapers.
 *
 * Each city has a curated list of regenerative organizations. We scrape their
 * events pages for JSON-LD, iCal links, or structured HTML to extract events.
 *
 * Rate-limited to 1.5s between requests to be respectful.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, extractJsonLd } from './utils'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const FETCH_TIMEOUT = 15_000
const RATE_LIMIT_MS = 1_500

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Organisation Definitions ───────────────────────────────────────────────

export interface LocalOrg {
  name: string
  city: string
  country: string
  lat: number
  lng: number
  urls: string[]  // event page URLs to scrape
}

const LOCAL_ORGS: LocalOrg[] = [
  // ── Bristol, UK ───────────────────────────────────────────────────────────
  {
    name: 'Shift Bristol',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://shiftbristol.org.uk/events/', 'https://shiftbristol.org.uk/whats-on/'],
  },
  {
    name: 'Bristol Climate & Nature Partnership',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://bristolclimatenature.org/events/'],
  },
  {
    name: 'Incredible Edible Bristol',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://www.incredibleediblebristol.org.uk/events/'],
  },
  {
    name: 'Transition Bristol',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://transitionbristol.net/events/'],
  },
  {
    name: 'Nature Collective Bristol',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://thenaturecollective.uk/events/'],
  },
  {
    name: 'Good Grief Network Bristol',
    city: 'Bristol', country: 'United Kingdom', lat: 51.4545, lng: -2.5879,
    urls: ['https://www.goodgriefnetwork.org/events/'],
  },

  // ── Dublin, Ireland ────────────────────────────────────────────────────────
  {
    name: 'Cultivate Ireland',
    city: 'Dublin', country: 'Ireland', lat: 53.3498, lng: -6.2603,
    urls: ['https://www.cultivate.ie/events/', 'https://www.cultivate.ie/whats-on/'],
  },
  {
    name: 'CELT Ireland',
    city: 'Dublin', country: 'Ireland', lat: 53.3498, lng: -6.2603,
    urls: ['https://www.celtnet.org/events/', 'https://www.celtnet.org/courses/'],
  },
  {
    name: 'Feasta',
    city: 'Dublin', country: 'Ireland', lat: 53.3498, lng: -6.2603,
    urls: ['https://www.feasta.org/events/'],
  },
  {
    name: 'Repair Café Ireland',
    city: 'Dublin', country: 'Ireland', lat: 53.3498, lng: -6.2603,
    urls: ['https://repaircafe.org/en/locations/?search=dublin'],
  },
  {
    name: 'Zero Waste Ireland',
    city: 'Dublin', country: 'Ireland', lat: 53.3498, lng: -6.2603,
    urls: ['https://www.zerowasteireland.ie/events/'],
  },
  {
    name: 'Slow Food Ireland',
    city: 'Dublin', country: 'Ireland', lat: 53.3498, lng: -6.2603,
    urls: ['https://www.slowfoodireland.com/events/'],
  },
  {
    name: 'Incredible Edible Ireland',
    city: 'Dublin', country: 'Ireland', lat: 53.3498, lng: -6.2603,
    urls: ['https://www.incredibleedible.ie/events/'],
  },
  {
    name: 'Irish Seed Savers',
    city: 'Dublin', country: 'Ireland', lat: 53.3498, lng: -6.2603,
    urls: ['https://www.irishseedsavers.ie/events/', 'https://www.irishseedsavers.ie/courses/'],
  },

  // ── Cloughjordan, Ireland ─────────────────────────────────────────────────
  {
    name: 'Cloughjordan Ecovillage',
    city: 'Cloughjordan', country: 'Ireland', lat: 52.9397, lng: -8.0261,
    urls: ['https://www.thevillage.ie/events/', 'https://www.thevillage.ie/whats-on/'],
  },

  // ── Malta ──────────────────────────────────────────────────────────────────
  {
    name: 'Gozo Sustainability Events',
    city: 'Gozo', country: 'Malta', lat: 36.0441, lng: 14.2394,
    urls: ['https://www.gozo.gov.mt/events/', 'https://gozo.gov.mt/en/Pages/Events.aspx'],
  },
  {
    name: 'Flimkien għal Ambjent Aħjar',
    city: 'Valletta', country: 'Malta', lat: 35.8989, lng: 14.5146,
    urls: ['https://www.ambjent.org/events/', 'https://www.ambjent.org/activities/'],
  },
  {
    name: 'Koperattiva Kummerċ Ġust',
    city: 'Valletta', country: 'Malta', lat: 35.8989, lng: 14.5146,
    urls: ['https://www.fairtrade.org.mt/events/'],
  },

  // ── Vienna, Austria ────────────────────────────────────────────────────────
  {
    name: 'Transition Wien',
    city: 'Vienna', country: 'Austria', lat: 48.2082, lng: 16.3738,
    urls: ['https://transition-wien.at/veranstaltungen/', 'https://transition-wien.at/events/'],
  },
  {
    name: 'Permakultur Austria',
    city: 'Vienna', country: 'Austria', lat: 48.2082, lng: 16.3738,
    urls: ['https://permakultur-austria.at/veranstaltungen/', 'https://permakultur-austria.at/events/'],
  },
  {
    name: 'Degrowth Austria',
    city: 'Vienna', country: 'Austria', lat: 48.2082, lng: 16.3738,
    urls: ['https://degrowth.at/events/', 'https://degrowth.at/veranstaltungen/'],
  },
  {
    name: 'Repair Café Austria',
    city: 'Vienna', country: 'Austria', lat: 48.2082, lng: 16.3738,
    urls: ['https://repaircafe.org/en/locations/?search=vienna'],
  },
  {
    name: 'ÖkoEvent Wien',
    city: 'Vienna', country: 'Austria', lat: 48.2082, lng: 16.3738,
    urls: ['https://www.oekoevent.at/veranstaltungen/', 'https://www.oekoevent.at/events/'],
  },
  {
    name: 'Foodsharing Wien',
    city: 'Vienna', country: 'Austria', lat: 48.2082, lng: 16.3738,
    urls: ['https://foodsharing.at/events/', 'https://foodsharing.at/veranstaltungen/'],
  },
  {
    name: 'Slow Food Austria',
    city: 'Vienna', country: 'Austria', lat: 48.2082, lng: 16.3738,
    urls: ['https://www.slowfood.at/events/', 'https://www.slowfood.at/veranstaltungen/'],
  },
  {
    name: 'SoLaWi Austria',
    city: 'Vienna', country: 'Austria', lat: 48.2082, lng: 16.3738,
    urls: ['https://www.solidarische-landwirtschaft.org/solawis-finden/?L=0&tx_solawi_map%5Bcountry%5D=AT'],
  },

  // ── Luxembourg City, Luxembourg ────────────────────────────────────────────
  {
    name: 'Mouvement Écologique Luxembourg',
    city: 'Luxembourg City', country: 'Luxembourg', lat: 49.6116, lng: 6.1319,
    urls: ['https://www.mouvement-ecologique.lu/agenda/', 'https://www.mouvement-ecologique.lu/events/'],
  },
  {
    name: 'natur&ëmwelt Luxembourg',
    city: 'Luxembourg City', country: 'Luxembourg', lat: 49.6116, lng: 6.1319,
    urls: ['https://www.naturemwelt.lu/agenda/', 'https://www.naturemwelt.lu/events/'],
  },
  {
    name: 'Oekofoire Luxembourg',
    city: 'Luxembourg City', country: 'Luxembourg', lat: 49.6116, lng: 6.1319,
    urls: ['https://www.oekofoire.lu/programme/', 'https://www.oekofoire.lu/events/'],
  },
  {
    name: 'Bio Lëtzebuerg',
    city: 'Luxembourg City', country: 'Luxembourg', lat: 49.6116, lng: 6.1319,
    urls: ['https://www.bio.lu/events/', 'https://www.bio.lu/agenda/'],
  },
  {
    name: 'Slow Food Luxembourg',
    city: 'Luxembourg City', country: 'Luxembourg', lat: 49.6116, lng: 6.1319,
    urls: ['https://www.slowfood.lu/events/', 'https://www.slowfood.lu/agenda/'],
  },
  {
    name: 'Zero Waste Luxembourg',
    city: 'Luxembourg City', country: 'Luxembourg', lat: 49.6116, lng: 6.1319,
    urls: ['https://www.zerowasteluxembourg.lu/events/', 'https://www.zerowasteluxembourg.lu/agenda/'],
  },
  {
    name: 'Repair Café Luxembourg',
    city: 'Luxembourg City', country: 'Luxembourg', lat: 49.6116, lng: 6.1319,
    urls: ['https://repaircafe.org/en/locations/?search=luxembourg'],
  },

  // ── Copenhagen, Denmark ────────────────────────────────────────────────────
  {
    name: 'Permakultur Danmark',
    city: 'Copenhagen', country: 'Denmark', lat: 55.6761, lng: 12.5683,
    urls: ['https://permakulturdk.dk/arrangementer/', 'https://permakulturdk.dk/events/'],
  },
  {
    name: 'LØS — Landsforeningen for Økosamfund',
    city: 'Copenhagen', country: 'Denmark', lat: 55.6761, lng: 12.5683,
    urls: ['https://los.dk/arrangementer/', 'https://los.dk/events/'],
  },
  {
    name: 'Omstilling Nu',
    city: 'Copenhagen', country: 'Denmark', lat: 55.6761, lng: 12.5683,
    urls: ['https://omstillingnu.dk/arrangementer/', 'https://omstillingnu.dk/events/'],
  },
  {
    name: 'Repair Café Denmark',
    city: 'Copenhagen', country: 'Denmark', lat: 55.6761, lng: 12.5683,
    urls: ['https://repaircafe.org/en/locations/?search=copenhagen'],
  },
  {
    name: 'Christiania Community Events',
    city: 'Copenhagen', country: 'Denmark', lat: 55.6734, lng: 12.5964,
    urls: ['https://www.christiania.org/events/', 'https://www.christiania.org/arrangementer/'],
  },

  // ── Vejle, Denmark ────────────────────────────────────────────────────────
  {
    name: 'Vejle Doughnut City',
    city: 'Vejle', country: 'Denmark', lat: 55.7113, lng: 9.5360,
    urls: ['https://www.vejle.dk/borger/baeredygtighed/', 'https://www.vejle.dk/om-kommunen/baeredygtighed/'],
  },

  // ── Helsinki, Finland ──────────────────────────────────────────────────────
  {
    name: 'Dodo ry Helsinki',
    city: 'Helsinki', country: 'Finland', lat: 60.1699, lng: 24.9384,
    urls: ['https://dodo.fi/tapahtumat/', 'https://dodo.fi/events/'],
  },
  {
    name: 'Permakulttuuriyhdistys ry',
    city: 'Helsinki', country: 'Finland', lat: 60.1699, lng: 24.9384,
    urls: ['https://permakultuuri.fi/tapahtumat/', 'https://permakultuuri.fi/events/'],
  },
  {
    name: 'Nordic Permaculture Finland',
    city: 'Helsinki', country: 'Finland', lat: 60.1699, lng: 24.9384,
    urls: ['https://nordicpermaculture.org/en/events/', 'https://nordicpermaculture.org/events/'],
  },
  {
    name: 'Repair Café Finland',
    city: 'Helsinki', country: 'Finland', lat: 60.1699, lng: 24.9384,
    urls: ['https://repaircafe.org/en/locations/?search=helsinki'],
  },
  {
    name: 'Nordic Permaculture Festival',
    city: 'Helsinki', country: 'Finland', lat: 60.1699, lng: 24.9384,
    urls: ['https://nordicpermaculturefestival.org/events/', 'https://nordicpermaculturefestival.org/'],
  },

  // ── Turku, Finland ────────────────────────────────────────────────────────
  {
    name: 'Koroinen Farm Turku',
    city: 'Turku', country: 'Finland', lat: 60.4518, lng: 22.2666,
    urls: ['https://www.koroinen.fi/tapahtumat/', 'https://www.koroinen.fi/events/'],
  },

  // ── Porto, Portugal ────────────────────────────────────────────────────────
  {
    name: 'Transition Porto',
    city: 'Porto', country: 'Portugal', lat: 41.1579, lng: -8.6291,
    urls: ['https://transicao.org/eventos/', 'https://transicao.org/agenda/'],
  },
  {
    name: 'GAIA Porto',
    city: 'Porto', country: 'Portugal', lat: 41.1579, lng: -8.6291,
    urls: ['https://gaia.org.pt/eventos/', 'https://gaia.org.pt/events/'],
  },
  {
    name: 'Repair Café Porto',
    city: 'Porto', country: 'Portugal', lat: 41.1579, lng: -8.6291,
    urls: ['https://repaircafe.org/en/locations/?search=porto'],
  },

  // ── Coimbra, Portugal ─────────────────────────────────────────────────────
  {
    name: 'Repair Café Coimbra',
    city: 'Coimbra', country: 'Portugal', lat: 40.2033, lng: -8.4103,
    urls: ['https://repaircafe.org/en/locations/?search=coimbra'],
  },

  // ── Évora, Portugal ───────────────────────────────────────────────────────
  {
    name: 'Rede Convergir — Projecto Oasis',
    city: 'Évora', country: 'Portugal', lat: 38.5667, lng: -7.9000,
    urls: ['https://redeconvergir.net/eventos/', 'https://redeconvergir.net/agenda/'],
  },

  // ── Manchester, UK ─────────────────────────────────────────────────────────
  {
    name: 'Incredible Edible Manchester',
    city: 'Manchester', country: 'United Kingdom', lat: 53.4808, lng: -2.2426,
    urls: ['https://www.incredibleediblemanchester.org/events/', 'https://www.incredibleedible.org.uk/find-a-group/incredible-edible-manchester/'],
  },
  {
    name: 'Transition Manchester',
    city: 'Manchester', country: 'United Kingdom', lat: 53.4808, lng: -2.2426,
    urls: ['https://transitionmanchester.net/events/'],
  },
  {
    name: 'FoodCycle Manchester',
    city: 'Manchester', country: 'United Kingdom', lat: 53.4808, lng: -2.2426,
    urls: ['https://www.foodcycle.org.uk/location/manchester/'],
  },

  // ── Edinburgh, UK ─────────────────────────────────────────────────────────
  {
    name: 'Transition Edinburgh',
    city: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lng: -3.1883,
    urls: ['https://www.transitionedinburgh.org.uk/events/'],
  },
  {
    name: 'Edinburgh Community Food',
    city: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lng: -3.1883,
    urls: ['https://www.edinburghcommunityfood.org.uk/events/'],
  },
  {
    name: 'Repair Café Edinburgh',
    city: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lng: -3.1883,
    urls: ['https://repaircafe.org/en/locations/?search=edinburgh', 'https://www.edinburghrepaircafe.org/events/'],
  },

  // ── Cardiff, UK ───────────────────────────────────────────────────────────
  {
    name: 'Incredible Edible Cardiff',
    city: 'Cardiff', country: 'United Kingdom', lat: 51.4816, lng: -3.1791,
    urls: ['https://www.incredibleedible.org.uk/find-a-group/incredible-edible-cardiff/'],
  },
  {
    name: 'Transition Cardiff',
    city: 'Cardiff', country: 'United Kingdom', lat: 51.4816, lng: -3.1791,
    urls: ['https://transitioncardiff.org.uk/events/'],
  },
  {
    name: 'FoodCycle Cardiff',
    city: 'Cardiff', country: 'United Kingdom', lat: 51.4816, lng: -3.1791,
    urls: ['https://www.foodcycle.org.uk/location/cardiff/'],
  },

  // ── Leeds, UK ─────────────────────────────────────────────────────────────
  {
    name: 'Incredible Edible Leeds',
    city: 'Leeds', country: 'United Kingdom', lat: 53.8008, lng: -1.5491,
    urls: ['https://www.incredibleedibleleeds.co.uk/events/'],
  },
  {
    name: 'Transition Leeds',
    city: 'Leeds', country: 'United Kingdom', lat: 53.8008, lng: -1.5491,
    urls: ['https://transitionleeds.org.uk/events/'],
  },
  {
    name: 'FoodCycle Leeds',
    city: 'Leeds', country: 'United Kingdom', lat: 53.8008, lng: -1.5491,
    urls: ['https://www.foodcycle.org.uk/location/leeds/'],
  },

  // ── Totnes, UK ────────────────────────────────────────────────────────────
  {
    name: 'Transition Town Totnes',
    city: 'Totnes', country: 'United Kingdom', lat: 50.4327, lng: -3.6862,
    urls: ['https://totnes.transitionnetwork.org/events/', 'https://www.transitiontowntotnes.org/events/'],
  },
  {
    name: 'Schumacher College',
    city: 'Totnes', country: 'United Kingdom', lat: 50.4327, lng: -3.6862,
    urls: ['https://campus.dartington.org/whats-on/', 'https://www.schumachercollege.org.uk/events/'],
  },

  // ── Cardiff, Wales ─────────────────────────────────────────────────────────
  {
    name: 'Permaculture Wales',
    city: 'Cardiff', country: 'United Kingdom', lat: 51.4816, lng: -3.1791,
    urls: ['https://www.permaculture.org.uk/wales/', 'https://www.permaculture.org.uk/events/?region=wales'],
  },
  {
    name: 'Incredible Edible Wales',
    city: 'Cardiff', country: 'United Kingdom', lat: 51.4816, lng: -3.1791,
    urls: ['https://www.incredibleedible.org.uk/find-a-group/?country=wales'],
  },
  {
    name: 'Wales Real Food and Farming Conference',
    city: 'Cardiff', country: 'United Kingdom', lat: 51.4816, lng: -3.1791,
    urls: ['https://www.wrffc.org.uk/events/', 'https://www.wrffc.org.uk/'],
  },
  {
    name: 'Repair Café Wales',
    city: 'Cardiff', country: 'United Kingdom', lat: 51.4816, lng: -3.1791,
    urls: ['https://repaircafe.org/en/locations/?search=cardiff', 'https://repaircafe.org/en/locations/?search=swansea'],
  },

  // ── Machynlleth, Wales ────────────────────────────────────────────────────
  {
    name: 'Centre for Alternative Technology',
    city: 'Machynlleth', country: 'United Kingdom', lat: 52.5849, lng: -3.8525,
    urls: ['https://cat.org.uk/events/', 'https://cat.org.uk/events-ede/'],
  },
  {
    name: 'Coed Hills Rural Artspace',
    city: 'Machynlleth', country: 'United Kingdom', lat: 51.4545, lng: -3.4200,
    urls: ['https://www.coedhills.org.uk/events/', 'https://www.coedhills.org.uk/whats-on/'],
  },

  // ── Caernarfon, Wales ─────────────────────────────────────────────────────
  {
    name: 'Transition Caernarfon',
    city: 'Caernarfon', country: 'United Kingdom', lat: 53.1388, lng: -4.2732,
    urls: ['https://transitioncaernarfon.org/events/'],
  },

  // ── Forres / Findhorn, Scotland ───────────────────────────────────────────
  {
    name: 'Findhorn Foundation',
    city: 'Forres', country: 'United Kingdom', lat: 57.6137, lng: -3.6227,
    urls: ['https://www.findhorn.org/events/'],
  },

  // ── Edinburgh, Scotland ─────────────────────────────────────────────────
  {
    name: 'Lauriston Farm Edinburgh',
    city: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lng: -3.1883,
    urls: ['https://lauristonfarm.scot/events/'],
  },

  // ── Glasgow, Scotland ───────────────────────────────────────────────────
  {
    name: 'Urban Roots Glasgow',
    city: 'Glasgow', country: 'United Kingdom', lat: 55.8642, lng: -4.2518,
    urls: ['https://www.concretegarden.org.uk/events/'],
  },

  // ── Scotland-wide ───────────────────────────────────────────────────────
  {
    name: 'Permaculture Scotland',
    city: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lng: -3.1883,
    urls: ['https://scotland.permaculture.org.uk/activities-map'],
  },
  {
    name: 'Transition Scotland',
    city: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lng: -3.1883,
    urls: ['https://www.transitionscotland.org/events/'],
  },
  {
    name: 'Repair Café Scotland',
    city: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lng: -3.1883,
    urls: ['https://repaircafe.org/en/locations/?search=scotland'],
  },
  {
    name: 'Community Land Scotland',
    city: 'Inverness', country: 'United Kingdom', lat: 57.4778, lng: -4.2247,
    urls: ['https://www.communitylandscotland.org.uk/events/'],
  },
  {
    name: 'Incredible Edible Scotland',
    city: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lng: -3.1883,
    urls: ['https://www.incredibleedible.org.uk/find-your-nearest-group/?_groups_location=scotland'],
  },
  {
    name: 'Grassroots Remedies Co-op',
    city: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lng: -3.1883,
    urls: ['https://grassrootsremedies.co.uk/events/'],
  },

  // ── Reykjavík, Iceland ───────────────────────────────────────────────────
  {
    name: 'Landvernd (Iceland Nature Conservation)',
    city: 'Reykjavík', country: 'Iceland', lat: 64.1355, lng: -21.8954,
    urls: ['https://landvernd.is/vidburdir/'],
  },
  {
    name: 'Transition Reykjavík',
    city: 'Reykjavík', country: 'Iceland', lat: 64.1355, lng: -21.8954,
    urls: ['https://transitionnetwork.org/transition-near-me/?country=iceland'],
  },
  {
    name: 'Repair Café Iceland',
    city: 'Reykjavík', country: 'Iceland', lat: 64.1355, lng: -21.8954,
    urls: ['https://repaircafe.org/en/locations/?search=iceland'],
  },
  {
    name: 'Waking Giants Iceland',
    city: 'Reykjavík', country: 'Iceland', lat: 64.1355, lng: -21.8954,
    urls: ['https://www.wakinggiants.com/events/'],
  },
  {
    name: 'Búseta Cooperative Housing',
    city: 'Reykjavík', country: 'Iceland', lat: 64.1355, lng: -21.8954,
    urls: ['https://www.buseta.is/'],
  },

  // ── Iceland-wide ────────────────────────────────────────────────────────
  {
    name: 'Nordic Permaculture Festival',
    city: 'Reykjavík', country: 'Iceland', lat: 64.1355, lng: -21.8954,
    urls: ['https://nordicpermaculturefestival.org/'],
  },
  {
    name: 'Matarborg Food Sovereignty Iceland',
    city: 'Reykjavík', country: 'Iceland', lat: 64.1355, lng: -21.8954,
    urls: ['https://www.matarborg.is/'],
  },

  // ── Belgrade, Serbia ─────────────────────────────────────────────────────
  {
    name: 'PermaVEZ Serbian Permaculture',
    city: 'Belgrade', country: 'Serbia', lat: 44.8176, lng: 20.4569,
    urls: ['https://permavez.org/'],
  },
  {
    name: 'Transition Belgrade',
    city: 'Belgrade', country: 'Serbia', lat: 44.8176, lng: 20.4569,
    urls: ['https://transitionnetwork.org/transition-near-me/?country=serbia'],
  },
  {
    name: 'Repair Café Serbia',
    city: 'Belgrade', country: 'Serbia', lat: 44.8176, lng: 20.4569,
    urls: ['https://repaircafe.org/en/locations/?search=serbia'],
  },
  {
    name: 'Greenpeace Serbia',
    city: 'Belgrade', country: 'Serbia', lat: 44.8176, lng: 20.4569,
    urls: ['https://www.greenpeace.org/serbia/events/'],
  },
  {
    name: 'Zero Waste Serbia',
    city: 'Belgrade', country: 'Serbia', lat: 44.8176, lng: 20.4569,
    urls: ['https://zerowaste.rs/events/'],
  },
  {
    name: 'Slow Food Serbia',
    city: 'Belgrade', country: 'Serbia', lat: 44.8176, lng: 20.4569,
    urls: ['https://www.slowfood.com/our-network/?fwp_sf_our_network_search=serbia'],
  },

  // ── Novi Sad, Serbia ────────────────────────────────────────────────────
  {
    name: 'Ekološki pokret Novog Sada',
    city: 'Novi Sad', country: 'Serbia', lat: 45.2671, lng: 19.8335,
    urls: ['https://eko.rs/'],
  },

  // ── Ljubljana, Slovenia ──────────────────────────────────────────────────
  {
    name: 'Umanotera Foundation',
    city: 'Ljubljana', country: 'Slovenia', lat: 46.0569, lng: 14.5058,
    urls: ['https://www.umanotera.si/dogodki/'],
  },
  {
    name: 'Ekologi Brez Meja (Zero Waste Slovenia)',
    city: 'Ljubljana', country: 'Slovenia', lat: 46.0569, lng: 14.5058,
    urls: ['https://ebm.si/events/'],
  },
  {
    name: 'Transition Slovenia',
    city: 'Ljubljana', country: 'Slovenia', lat: 46.0569, lng: 14.5058,
    urls: ['https://transitionnetwork.org/transition-near-me/?country=slovenia'],
  },
  {
    name: 'Repair Café Slovenia',
    city: 'Ljubljana', country: 'Slovenia', lat: 46.0569, lng: 14.5058,
    urls: ['https://repaircafe.org/en/locations/?search=slovenia'],
  },
  {
    name: 'GEN Slovenia Ecovillage Network',
    city: 'Ljubljana', country: 'Slovenia', lat: 46.0569, lng: 14.5058,
    urls: ['https://ecovillage.org/our-work/regions/gen-europe/?fwp_country=slovenia'],
  },
  {
    name: 'Slow Food Slovenia',
    city: 'Ljubljana', country: 'Slovenia', lat: 46.0569, lng: 14.5058,
    urls: ['https://www.slowfood.si/events/'],
  },
  {
    name: 'Biotehniška fakulteta Ljubljana',
    city: 'Ljubljana', country: 'Slovenia', lat: 46.0569, lng: 14.5058,
    urls: ['https://www.bf.uni-lj.si/en/events/'],
  },

  // ── Budapest, Hungary ────────────────────────────────────────────────────
  {
    name: 'MagosVölgy Ecological Farm',
    city: 'Budapest', country: 'Hungary', lat: 47.4979, lng: 19.0402,
    urls: ['https://magosvolgyfarm.hu/events/'],
  },
  {
    name: 'Transition Hungary',
    city: 'Budapest', country: 'Hungary', lat: 47.4979, lng: 19.0402,
    urls: ['https://transitionnetwork.org/transition-near-me/?country=hungary'],
  },
  {
    name: 'Repair Café Hungary',
    city: 'Budapest', country: 'Hungary', lat: 47.4979, lng: 19.0402,
    urls: ['https://repaircafe.org/en/locations/?search=hungary'],
  },
  {
    name: 'Védegylet Environmental NGO',
    city: 'Budapest', country: 'Hungary', lat: 47.4979, lng: 19.0402,
    urls: ['https://vedegylet.hu/esemenyek/'],
  },
  {
    name: 'Slow Food Hungary',
    city: 'Budapest', country: 'Hungary', lat: 47.4979, lng: 19.0402,
    urls: ['https://www.slowfood.hu/esemenyek/'],
  },
  {
    name: 'Ökológiai Gazdálkodók Szövetsége',
    city: 'Budapest', country: 'Hungary', lat: 47.4979, lng: 19.0402,
    urls: ['https://www.biokontroll.hu/esemenyek/'],
  },

  // ── Toulouse, France ──────────────────────────────────────────────────────
  {
    name: 'Colibris Toulouse',
    city: 'Toulouse', country: 'France', lat: 43.6047, lng: 1.4442,
    urls: ['https://colibris-lemouvement.org/agenda?field_departement_value=31'],
  },
  {
    name: 'Alternatiba Toulouse',
    city: 'Toulouse', country: 'France', lat: 43.6047, lng: 1.4442,
    urls: ['https://alternatiba.eu/toulouse/', 'https://alternatiba.eu/agenda/'],
  },
  {
    name: 'Repair Café Toulouse',
    city: 'Toulouse', country: 'France', lat: 43.6047, lng: 1.4442,
    urls: ['https://repaircafe.org/en/locations/?search=toulouse'],
  },
  {
    name: 'Incroyables Comestibles Toulouse',
    city: 'Toulouse', country: 'France', lat: 43.6047, lng: 1.4442,
    urls: ['https://lesincroyablescomestibles.fr/toulouse/'],
  },

  // ── Montpellier, France ───────────────────────────────────────────────────
  {
    name: 'Colibris Montpellier',
    city: 'Montpellier', country: 'France', lat: 43.6108, lng: 3.8767,
    urls: ['https://colibris-lemouvement.org/agenda?field_departement_value=34'],
  },
  {
    name: 'Transition Montpellier',
    city: 'Montpellier', country: 'France', lat: 43.6108, lng: 3.8767,
    urls: ['https://transitionmontpellier.fr/evenements/'],
  },
  {
    name: 'Repair Café Montpellier',
    city: 'Montpellier', country: 'France', lat: 43.6108, lng: 3.8767,
    urls: ['https://repaircafe.org/en/locations/?search=montpellier'],
  },
  {
    name: 'Permaculture France — Montpellier',
    city: 'Montpellier', country: 'France', lat: 43.6108, lng: 3.8767,
    urls: ['https://www.permaculture-france.fr/evenements/'],
  },

  // ── Lyon, France ───────────────────────────────────────────────────────────
  {
    name: 'Colibris Lyon',
    city: 'Lyon', country: 'France', lat: 45.7640, lng: 4.8357,
    urls: ['https://colibris-lemouvement.org/agenda?field_departement_value=69'],
  },
  {
    name: 'Incroyables Comestibles Lyon',
    city: 'Lyon', country: 'France', lat: 45.7640, lng: 4.8357,
    urls: ['https://lesincroyablescomestibles.fr/lyon/'],
  },
  {
    name: 'Repair Café Lyon',
    city: 'Lyon', country: 'France', lat: 45.7640, lng: 4.8357,
    urls: ['https://repaircafe.org/en/locations/?search=lyon'],
  },
  {
    name: 'AMAP Lyon',
    city: 'Lyon', country: 'France', lat: 45.7640, lng: 4.8357,
    urls: ['https://amap-aura.org/trouver-une-amap/', 'https://www.reseau-amap.org/recherche-amap.php'],
  },

  // ── Nantes, France ────────────────────────────────────────────────────────
  {
    name: 'Transition Nantes',
    city: 'Nantes', country: 'France', lat: 47.2184, lng: -1.5536,
    urls: ['https://transitionnantes.fr/evenements/', 'https://transitionnantes.fr/agenda/'],
  },
  {
    name: 'Incroyables Comestibles Nantes',
    city: 'Nantes', country: 'France', lat: 47.2184, lng: -1.5536,
    urls: ['https://lesincroyablescomestibles.fr/nantes/'],
  },
  {
    name: 'Repair Café Nantes',
    city: 'Nantes', country: 'France', lat: 47.2184, lng: -1.5536,
    urls: ['https://repaircafe.org/en/locations/?search=nantes'],
  },

  // ── Grenoble, France ──────────────────────────────────────────────────────
  {
    name: 'Transition Grenoble',
    city: 'Grenoble', country: 'France', lat: 45.1885, lng: 5.7245,
    urls: ['https://transitiongrenoble.fr/evenements/', 'https://transitiongrenoble.fr/agenda/'],
  },
  {
    name: 'AMAP Grenoble',
    city: 'Grenoble', country: 'France', lat: 45.1885, lng: 5.7245,
    urls: ['https://amap-aura.org/trouver-une-amap/'],
  },
  {
    name: 'Repair Café Grenoble',
    city: 'Grenoble', country: 'France', lat: 45.1885, lng: 5.7245,
    urls: ['https://repaircafe.org/en/locations/?search=grenoble'],
  },

  // ── Bilbao, Spain ─────────────────────────────────────────────────────────
  {
    name: 'Red de Transición Bilbao',
    city: 'Bilbao', country: 'Spain', lat: 43.2630, lng: -2.9350,
    urls: ['https://www.reddetransicion.org/agenda/', 'https://www.reddetransicion.org/eventos/'],
  },
  {
    name: 'Mercado Agroecológico Bilbao',
    city: 'Bilbao', country: 'Spain', lat: 43.2630, lng: -2.9350,
    urls: ['https://www.mercadoagroecologico.org/eventos/'],
  },
  {
    name: 'Mondragon University Events',
    city: 'Bilbao', country: 'Spain', lat: 43.2630, lng: -2.9350,
    urls: ['https://www.mondragon.edu/en/events'],
  },

  // ── Valencia, Spain ────────────────────────────────────────────────────────
  {
    name: 'Red Transición Valencia',
    city: 'Valencia', country: 'Spain', lat: 39.4699, lng: -0.3763,
    urls: ['https://www.reddetransicion.org/agenda/', 'https://www.reddetransicion.org/eventos/'],
  },
  {
    name: 'Mercat Agroecològic Valencia',
    city: 'Valencia', country: 'Spain', lat: 39.4699, lng: -0.3763,
    urls: ['https://www.mercatagroecologic.org/eventos/', 'https://www.mercatagroecologic.org/agenda/'],
  },
  {
    name: 'Repair Café Valencia',
    city: 'Valencia', country: 'Spain', lat: 39.4699, lng: -0.3763,
    urls: ['https://repaircafe.org/en/locations/?search=valencia'],
  },

  // ── Seville, Spain ────────────────────────────────────────────────────────
  {
    name: 'Transition Sevilla',
    city: 'Seville', country: 'Spain', lat: 37.3891, lng: -5.9845,
    urls: ['https://www.reddetransicion.org/sevilla/', 'https://transicionsevilla.org/eventos/'],
  },
  {
    name: 'Mercado Agroecológico Sevilla',
    city: 'Seville', country: 'Spain', lat: 37.3891, lng: -5.9845,
    urls: ['https://www.ecomarketbcn.com/sevilla/', 'https://www.reddetransicion.org/sevilla/'],
  },

  // ── Santiago de Compostela, Spain ─────────────────────────────────────────
  {
    name: 'Transition Santiago',
    city: 'Santiago de Compostela', country: 'Spain', lat: 42.8782, lng: -8.5448,
    urls: ['https://www.reddetransicion.org/santiago/'],
  },

  // ── Freiburg, Germany ─────────────────────────────────────────────────────
  {
    name: 'Ernährungsrat Freiburg',
    city: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421,
    urls: ['https://ernaehrungsrat-freiburg.de/veranstaltungen/', 'https://ernaehrungsrat-freiburg.de/termine/'],
  },
  {
    name: 'Transition Freiburg',
    city: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421,
    urls: ['https://transition-freiburg.de/veranstaltungen/', 'https://transition-freiburg.de/events/'],
  },
  {
    name: 'Stadtteilverein Vauban',
    city: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421,
    urls: ['https://stadtteilverein-vauban.de/veranstaltungen/', 'https://stadtteilverein-vauban.de/termine/'],
  },
  {
    name: 'Regenerate Forum',
    city: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421,
    urls: ['https://regenerateforum.org/events/'],
  },
  {
    name: 'Permakultur Freiburg',
    city: 'Freiburg', country: 'Germany', lat: 47.9990, lng: 7.8421,
    urls: ['https://www.permakultur.de/veranstaltungen/', 'https://www.permakultur.de/termine/'],
  },

  // ── Hamburg, Germany ────────────────────────────────────────────────────────
  {
    name: 'Transition Hamburg',
    city: 'Hamburg', country: 'Germany', lat: 53.5511, lng: 9.9937,
    urls: ['https://www.transition-hamburg.de/veranstaltungen/', 'https://www.transition-hamburg.de/termine/'],
  },
  {
    name: 'Foodsharing Hamburg',
    city: 'Hamburg', country: 'Germany', lat: 53.5511, lng: 9.9937,
    urls: ['https://foodsharing.de/region?bid=31', 'https://foodsharing.de/events?bid=31'],
  },
  {
    name: 'Repair Café Hamburg',
    city: 'Hamburg', country: 'Germany', lat: 53.5511, lng: 9.9937,
    urls: ['https://repaircafe.org/en/locations/?search=hamburg'],
  },

  // ── Munich, Germany ───────────────────────────────────────────────────────
  {
    name: 'Transition München',
    city: 'Munich', country: 'Germany', lat: 48.1351, lng: 11.5820,
    urls: ['https://www.transition-muenchen.de/veranstaltungen/', 'https://www.transition-muenchen.de/termine/'],
  },
  {
    name: 'SoLaWi München',
    city: 'Munich', country: 'Germany', lat: 48.1351, lng: 11.5820,
    urls: ['https://www.solawi-muenchen.de/termine/', 'https://www.solawi-muenchen.de/veranstaltungen/'],
  },
  {
    name: 'Repair Café München',
    city: 'Munich', country: 'Germany', lat: 48.1351, lng: 11.5820,
    urls: ['https://repaircafe.org/en/locations/?search=munich'],
  },

  // ── Leipzig, Germany ──────────────────────────────────────────────────────
  {
    name: 'Transition Leipzig',
    city: 'Leipzig', country: 'Germany', lat: 51.3397, lng: 12.3731,
    urls: ['https://www.transition-leipzig.de/veranstaltungen/', 'https://www.transition-leipzig.de/termine/'],
  },
  {
    name: 'Stadtfarm Leipzig',
    city: 'Leipzig', country: 'Germany', lat: 51.3397, lng: 12.3731,
    urls: ['https://www.annalinde-leipzig.de/veranstaltungen/', 'https://www.annalinde-leipzig.de/termine/'],
  },
  {
    name: 'Querfeld CSA Leipzig',
    city: 'Leipzig', country: 'Germany', lat: 51.3397, lng: 12.3731,
    urls: ['https://www.querbeet-leipzig.de/termine/', 'https://www.querbeet-leipzig.de/veranstaltungen/'],
  },

  // ── Stuttgart, Germany ────────────────────────────────────────────────────
  {
    name: 'Ernährungsrat Stuttgart',
    city: 'Stuttgart', country: 'Germany', lat: 48.7758, lng: 9.1829,
    urls: ['https://ernaehrungsrat-stuttgart.de/veranstaltungen/', 'https://ernaehrungsrat-stuttgart.de/termine/'],
  },
  {
    name: 'Transition Stuttgart',
    city: 'Stuttgart', country: 'Germany', lat: 48.7758, lng: 9.1829,
    urls: ['https://www.transition-stuttgart.de/veranstaltungen/', 'https://www.transition-stuttgart.de/termine/'],
  },

  // ── Wageningen, Netherlands ───────────────────────────────────────────────
  {
    name: 'WUR Public Events',
    city: 'Wageningen', country: 'Netherlands', lat: 51.9692, lng: 5.6656,
    urls: ['https://www.wur.nl/en/events.htm'],
  },
  {
    name: 'WUR Rural Sociology',
    city: 'Wageningen', country: 'Netherlands', lat: 51.9692, lng: 5.6656,
    urls: ['https://ruralsociologywageningen.nl/category/events/'],
  },
  {
    name: 'Herenboer Wageningen',
    city: 'Wageningen', country: 'Netherlands', lat: 51.9692, lng: 5.6656,
    urls: ['https://www.herenboeren.nl/agenda/'],
  },

  // ── Rotterdam, Netherlands ─────────────────────────────────────────────────
  {
    name: 'Repair Café Rotterdam',
    city: 'Rotterdam', country: 'Netherlands', lat: 51.9244, lng: 4.4777,
    urls: ['https://repaircafe.org/en/locations/?search=rotterdam'],
  },
  {
    name: 'Transition Rotterdam',
    city: 'Rotterdam', country: 'Netherlands', lat: 51.9244, lng: 4.4777,
    urls: ['https://transitierotterdam.nl/agenda/', 'https://transitierotterdam.nl/events/'],
  },
  {
    name: 'Herenboer Rotterdam',
    city: 'Rotterdam', country: 'Netherlands', lat: 51.9244, lng: 4.4777,
    urls: ['https://www.herenboeren.nl/agenda/'],
  },

  // ── Utrecht, Netherlands ──────────────────────────────────────────────────
  {
    name: 'Transition Utrecht',
    city: 'Utrecht', country: 'Netherlands', lat: 52.0907, lng: 5.1214,
    urls: ['https://transitieutrecht.nl/agenda/', 'https://transitieutrecht.nl/events/'],
  },
  {
    name: 'Repair Café Utrecht',
    city: 'Utrecht', country: 'Netherlands', lat: 52.0907, lng: 5.1214,
    urls: ['https://repaircafe.org/en/locations/?search=utrecht'],
  },
  {
    name: 'De Ceuvel Community',
    city: 'Utrecht', country: 'Netherlands', lat: 52.0907, lng: 5.1214,
    urls: ['https://deceuvel.nl/en/events/'],
  },

  // ── Groningen, Netherlands ────────────────────────────────────────────────
  {
    name: 'Transition Groningen',
    city: 'Groningen', country: 'Netherlands', lat: 53.2194, lng: 6.5665,
    urls: ['https://transitiegroningen.nl/agenda/', 'https://transitiegroningen.nl/events/'],
  },
  {
    name: 'Stadslandbouw Groningen',
    city: 'Groningen', country: 'Netherlands', lat: 53.2194, lng: 6.5665,
    urls: ['https://www.stadslandbouwgroningen.nl/agenda/', 'https://www.stadslandbouwgroningen.nl/events/'],
  },

  // ── Brighton, UK ──────────────────────────────────────────────────────────
  {
    name: 'Brighton Permaculture Trust',
    city: 'Brighton', country: 'United Kingdom', lat: 50.8225, lng: -0.1372,
    urls: ['https://brightonpermaculture.org.uk/courses-and-events/'],
  },
  {
    name: 'Stanmer Organics',
    city: 'Brighton', country: 'United Kingdom', lat: 50.8225, lng: -0.1372,
    urls: ['https://www.stanmerorganics.com/events/'],
  },
  {
    name: 'Brighton & Hove Food Partnership',
    city: 'Brighton', country: 'United Kingdom', lat: 50.8225, lng: -0.1372,
    urls: ['https://bhfood.org.uk/events/'],
  },
  {
    name: 'Fork and Dig It Brighton',
    city: 'Brighton', country: 'United Kingdom', lat: 50.8225, lng: -0.1372,
    urls: ['https://www.forkanddigit.org.uk/events/'],
  },

  // ── Ghent, Belgium ────────────────────────────────────────────────────────
  {
    name: 'Ghent en Garde',
    city: 'Ghent', country: 'Belgium', lat: 51.0543, lng: 3.7174,
    urls: ['https://gentengarde.be/activiteiten/', 'https://gentengarde.be/events/'],
  },
  {
    name: 'Transitie Gent',
    city: 'Ghent', country: 'Belgium', lat: 51.0543, lng: 3.7174,
    urls: ['https://transitiegent.be/agenda/', 'https://transitiegent.be/events/'],
  },
  {
    name: 'Repair Café Ghent',
    city: 'Ghent', country: 'Belgium', lat: 51.0543, lng: 3.7174,
    urls: ['https://repaircafe.org/en/locations/?search=ghent'],
  },
  {
    name: 'CSA Netwerk Belgium — Ghent',
    city: 'Ghent', country: 'Belgium', lat: 51.0543, lng: 3.7174,
    urls: ['https://www.csanetwerk.be/agenda/'],
  },

  // ── Basel, Switzerland ─────────────────────────────────────────────────────
  {
    name: 'Transition Basel',
    city: 'Basel', country: 'Switzerland', lat: 47.5596, lng: 7.5886,
    urls: ['https://www.transition-basel.ch/veranstaltungen/', 'https://www.transition-basel.ch/events/'],
  },
  {
    name: 'Repair Café Basel',
    city: 'Basel', country: 'Switzerland', lat: 47.5596, lng: 7.5886,
    urls: ['https://repaircafe.org/en/locations/?search=basel'],
  },
  {
    name: 'Permakultur Basel',
    city: 'Basel', country: 'Switzerland', lat: 47.5596, lng: 7.5886,
    urls: ['https://www.permakultur.ch/veranstaltungen/', 'https://www.permakultur.ch/events/'],
  },
  {
    name: 'CSA Basel',
    city: 'Basel', country: 'Switzerland', lat: 47.5596, lng: 7.5886,
    urls: ['https://www.solawi.ch/agenda/', 'https://www.solawi.ch/events/'],
  },

  // ── Bern, Switzerland ─────────────────────────────────────────────────────
  {
    name: 'Transition Bern',
    city: 'Bern', country: 'Switzerland', lat: 46.9480, lng: 7.4474,
    urls: ['https://www.transition-bern.ch/veranstaltungen/', 'https://www.transition-bern.ch/events/'],
  },
  {
    name: 'Repair Café Bern',
    city: 'Bern', country: 'Switzerland', lat: 46.9480, lng: 7.4474,
    urls: ['https://repaircafe.org/en/locations/?search=bern'],
  },
  {
    name: 'Ernährungsrat Bern',
    city: 'Bern', country: 'Switzerland', lat: 46.9480, lng: 7.4474,
    urls: ['https://ernaehrungsrat-bern.ch/veranstaltungen/', 'https://ernaehrungsrat-bern.ch/events/'],
  },

  // ── Lausanne, Switzerland ─────────────────────────────────────────────────
  {
    name: 'Transition Lausanne',
    city: 'Lausanne', country: 'Switzerland', lat: 46.5197, lng: 6.6323,
    urls: ['https://www.intransition.ch/lausanne/', 'https://transitionlausanne.ch/evenements/'],
  },
  {
    name: 'Incroyables Comestibles Lausanne',
    city: 'Lausanne', country: 'Switzerland', lat: 46.5197, lng: 6.6323,
    urls: ['https://lesincroyablescomestibles.fr/lausanne/'],
  },
  {
    name: 'Repair Café Lausanne',
    city: 'Lausanne', country: 'Switzerland', lat: 46.5197, lng: 6.6323,
    urls: ['https://repaircafe.org/en/locations/?search=lausanne'],
  },

  // ── Leuven, Belgium ────────────────────────────────────────────────────────
  {
    name: 'KU Leuven Sustainability Events',
    city: 'Leuven', country: 'Belgium', lat: 50.8798, lng: 4.7005,
    urls: ['https://www.kuleuven.be/duurzaamheid/activiteiten', 'https://www.kuleuven.be/sustainability/events'],
  },
  {
    name: 'Transition Leuven',
    city: 'Leuven', country: 'Belgium', lat: 50.8798, lng: 4.7005,
    urls: ['https://transitieleuven.be/agenda/', 'https://transitieleuven.be/events/'],
  },
  {
    name: 'Repair Café Leuven',
    city: 'Leuven', country: 'Belgium', lat: 50.8798, lng: 4.7005,
    urls: ['https://repaircafe.org/en/locations/?search=leuven'],
  },

  // ── Liège, Belgium ────────────────────────────────────────────────────────
  {
    name: 'Transition Liège',
    city: 'Liège', country: 'Belgium', lat: 50.6326, lng: 5.5797,
    urls: ['https://www.intransition.be/liege/', 'https://liege.entransition.be/agenda/'],
  },
  {
    name: 'Repair Café Liège',
    city: 'Liège', country: 'Belgium', lat: 50.6326, lng: 5.5797,
    urls: ['https://repaircafe.org/en/locations/?search=liege'],
  },
  {
    name: 'GASAP Liège',
    city: 'Liège', country: 'Belgium', lat: 50.6326, lng: 5.5797,
    urls: ['https://gasap.be/agenda/', 'https://gasap.be/events/'],
  },

  // ── Antwerp, Belgium ──────────────────────────────────────────────────────
  {
    name: 'Transitie Antwerpen',
    city: 'Antwerp', country: 'Belgium', lat: 51.2194, lng: 4.4025,
    urls: ['https://transitieantwerpen.be/agenda/', 'https://transitieantwerpen.be/events/'],
  },
  {
    name: 'Repair Café Antwerpen',
    city: 'Antwerp', country: 'Belgium', lat: 51.2194, lng: 4.4025,
    urls: ['https://repaircafe.org/en/locations/?search=antwerp'],
  },
  {
    name: 'CSA Antwerpen',
    city: 'Antwerp', country: 'Belgium', lat: 51.2194, lng: 4.4025,
    urls: ['https://www.csanetwerk.be/agenda/'],
  },

  // ── Bologna, Italy ────────────────────────────────────────────────────────
  {
    name: 'WWOOF Italia Events',
    city: 'Bologna', country: 'Italy', lat: 44.4949, lng: 11.3426,
    urls: ['https://www.wwoof.it/eventi/', 'https://www.wwoof.it/en/events/'],
  },
  {
    name: 'Transizione Italia — Bologna',
    city: 'Bologna', country: 'Italy', lat: 44.4949, lng: 11.3426,
    urls: ['https://transizioneitalia.it/eventi/'],
  },
  {
    name: 'Legacoop Bologna',
    city: 'Bologna', country: 'Italy', lat: 44.4949, lng: 11.3426,
    urls: ['https://www.legacoop.bologna.it/eventi/', 'https://www.legacoop.bologna.it/events/'],
  },

  // ── Victoria, Canada ───────────────────────────────────────────────────────
  {
    name: 'Transition Victoria',
    city: 'Victoria', country: 'Canada', lat: 48.4284, lng: -123.3656,
    urls: ['https://transitionvictoria.ning.com/events/'],
  },

  // ── Ottawa, Canada ────────────────────────────────────────────────────────
  {
    name: 'Transition Ottawa',
    city: 'Ottawa', country: 'Canada', lat: 45.4215, lng: -75.6972,
    urls: ['https://transitionottawa.ca/events/'],
  },
  {
    name: 'Ecology Ottawa',
    city: 'Ottawa', country: 'Canada', lat: 45.4215, lng: -75.6972,
    urls: ['https://ecologyottawa.ca/events/', 'https://ecologyottawa.ca/upcoming-events/'],
  },
  {
    name: 'Repair Café Ottawa',
    city: 'Ottawa', country: 'Canada', lat: 45.4215, lng: -75.6972,
    urls: ['https://repaircafe.org/en/locations/?search=ottawa'],
  },

  // ── Halifax, Canada ───────────────────────────────────────────────────────
  {
    name: 'Ecology Action Centre Halifax',
    city: 'Halifax', country: 'Canada', lat: 44.6488, lng: -63.5752,
    urls: ['https://ecologyaction.ca/events/', 'https://ecologyaction.ca/upcoming-events/'],
  },
  {
    name: 'Transition Halifax',
    city: 'Halifax', country: 'Canada', lat: 44.6488, lng: -63.5752,
    urls: ['https://transitionhalifax.ca/events/'],
  },

  // ── Quebec City, Canada ───────────────────────────────────────────────────
  {
    name: 'Transition Quebec City',
    city: 'Quebec City', country: 'Canada', lat: 46.8139, lng: -71.2080,
    urls: ['https://www.intransition.ca/quebec/'],
  },
  {
    name: 'Incroyables Comestibles Quebec',
    city: 'Quebec City', country: 'Canada', lat: 46.8139, lng: -71.2080,
    urls: ['https://lesincroyablescomestibles.fr/quebec/'],
  },

  // ── Turin, Italy ───────────────────────────────────────────────────────────
  {
    name: 'Transition Torino',
    city: 'Turin', country: 'Italy', lat: 45.0703, lng: 7.6869,
    urls: ['https://transizioneitalia.it/torino/', 'https://www.transitiontorino.it/eventi/'],
  },
  {
    name: 'GAS Torino',
    city: 'Turin', country: 'Italy', lat: 45.0703, lng: 7.6869,
    urls: ['https://www.gastorino.it/eventi/', 'https://www.gastorino.it/agenda/'],
  },
  {
    name: 'Repair Café Torino',
    city: 'Turin', country: 'Italy', lat: 45.0703, lng: 7.6869,
    urls: ['https://repaircafe.org/en/locations/?search=torino'],
  },

  // ── Naples, Italy ─────────────────────────────────────────────────────────
  {
    name: 'Transition Napoli',
    city: 'Naples', country: 'Italy', lat: 40.8518, lng: 14.2681,
    urls: ['https://transizioneitalia.it/napoli/', 'https://www.transitionnapoli.it/eventi/'],
  },
  {
    name: 'GAS Napoli',
    city: 'Naples', country: 'Italy', lat: 40.8518, lng: 14.2681,
    urls: ['https://www.gasnapoli.it/eventi/', 'https://www.gasnapoli.it/agenda/'],
  },
  {
    name: 'Slow Food Campania',
    city: 'Naples', country: 'Italy', lat: 40.8518, lng: 14.2681,
    urls: ['https://www.slowfood.it/campania/eventi/', 'https://www.slowfoodcampania.it/eventi/'],
  },

  // ── Padova, Italy ─────────────────────────────────────────────────────────
  {
    name: 'Transition Padova',
    city: 'Padova', country: 'Italy', lat: 45.4064, lng: 11.8768,
    urls: ['https://transizioneitalia.it/padova/'],
  },
  {
    name: 'GAS Padova',
    city: 'Padova', country: 'Italy', lat: 45.4064, lng: 11.8768,
    urls: ['https://www.gaspadova.it/eventi/', 'https://www.gaspadova.it/agenda/'],
  },

  // ── Seattle, USA ──────────────────────────────────────────────────────────
  {
    name: 'Transition Seattle',
    city: 'Seattle', country: 'United States', lat: 47.6062, lng: -122.3321,
    urls: ['https://transitionseattle.org/events/'],
  },
  {
    name: 'Tilth Alliance',
    city: 'Seattle', country: 'United States', lat: 47.6062, lng: -122.3321,
    urls: ['https://tilthalliance.org/events/', 'https://tilthalliance.org/upcoming-events/'],
  },
  {
    name: 'Beacon Food Forest',
    city: 'Seattle', country: 'United States', lat: 47.5620, lng: -122.3110,
    urls: ['https://beaconfoodforest.org/events/', 'https://beaconfoodforest.org/volunteer/'],
  },

  // ── Chicago, USA ──────────────────────────────────────────────────────────
  {
    name: 'Transition Chicago',
    city: 'Chicago', country: 'United States', lat: 41.8781, lng: -87.6298,
    urls: ['https://transitionchicago.org/events/'],
  },
  {
    name: 'Growing Power Chicago',
    city: 'Chicago', country: 'United States', lat: 41.8781, lng: -87.6298,
    urls: ['https://www.growingpower.org/events/'],
  },
  {
    name: 'Repair Café Chicago',
    city: 'Chicago', country: 'United States', lat: 41.8781, lng: -87.6298,
    urls: ['https://repaircafe.org/en/locations/?search=chicago'],
  },

  // ── Philadelphia, USA ─────────────────────────────────────────────────────
  {
    name: 'Philadelphia Orchard Project',
    city: 'Philadelphia', country: 'United States', lat: 39.9526, lng: -75.1652,
    urls: ['https://www.phillyorchards.org/events/', 'https://www.phillyorchards.org/volunteer/'],
  },
  {
    name: 'Transition Philly',
    city: 'Philadelphia', country: 'United States', lat: 39.9526, lng: -75.1652,
    urls: ['https://transitionphilly.org/events/'],
  },
  {
    name: 'Repair Café Philly',
    city: 'Philadelphia', country: 'United States', lat: 39.9526, lng: -75.1652,
    urls: ['https://repaircafe.org/en/locations/?search=philadelphia'],
  },

  // ── Austin, USA ───────────────────────────────────────────────────────────
  {
    name: 'Transition Austin',
    city: 'Austin', country: 'United States', lat: 30.2672, lng: -97.7431,
    urls: ['https://transitionaustin.org/events/'],
  },
  {
    name: 'Barton Springs Community Garden',
    city: 'Austin', country: 'United States', lat: 30.2640, lng: -97.7710,
    urls: ['https://www.sustainablefoodcenter.org/events/'],
  },

  // ── Asheville, USA ────────────────────────────────────────────────────────
  {
    name: 'Organic Growers School',
    city: 'Asheville', country: 'United States', lat: 35.5951, lng: -82.5515,
    urls: ['https://organicgrowersschool.org/events/', 'https://organicgrowersschool.org/conferences/'],
  },

  // ── Wellbeing & Nature Connection — Global ──────────────────────────────
  {
    name: 'Embercombe',
    city: 'Exeter', country: 'United Kingdom', lat: 50.7184, lng: -3.5339,
    urls: ['https://embercombe.org/events/'],
  },
  {
    name: 'All We Can Save Circles',
    city: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278,
    urls: ['https://www.allwecansave.earth/circles'],
  },
  {
    name: 'Shinrin-Yoku Association Europe',
    city: 'Berlin', country: 'Germany', lat: 52.5200, lng: 13.4050,
    urls: ['https://shinrin-yoku-association.com/events/'],
  },
  {
    name: 'ANFT Forest Therapy',
    city: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278,
    urls: ['https://www.anft.earth/find-a-guide/'],
  },
]

// ─── Scraper Logic ──────────────────────────────────────────────────────────

/**
 * Scrape a single URL for events using multiple extraction strategies.
 */
async function scrapeOrgPage(url: string, org: LocalOrg): Promise<RawEvent[]> {
  let html: string
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!res.ok) return []
    html = await res.text()
  } catch {
    return []
  }

  const events: RawEvent[] = []

  // Strategy 1: JSON-LD extraction (handles ItemList and standalone Event)
  const jsonLdEvents = extractJsonLd(html, 'local-network')
  for (const ev of jsonLdEvents) {
    events.push({
      ...ev,
      source: 'local-network',
      source_id: `local-${hashStr(ev.source_url ?? ev.title + ev.starts_at)}`,
      organizer: org.name,
      lat: ev.lat || org.lat,
      lng: ev.lng || org.lng,
    })
  }

  // Strategy 2: Microdata / hEvent extraction
  const hEvents = extractHEvents(html, org)
  events.push(...hEvents)

  // Strategy 3: WordPress/Tribe Events pattern extraction
  const wpEvents = extractWordPressEvents(html, url, org)
  events.push(...wpEvents)

  // Strategy 4: Generic date + title pattern extraction
  if (events.length === 0) {
    const genericEvents = extractGenericEvents(html, url, org)
    events.push(...genericEvents)
  }

  return events
}

/**
 * Extract hEvent/microdata events from HTML.
 */
function extractHEvents(html: string, org: LocalOrg): RawEvent[] {
  const events: RawEvent[] = []
  // Match h-event or vevent microformat blocks
  const hEventBlocks = html.match(/<[^>]*class="[^"]*(?:h-event|vevent|type-tribe_events|event-item|tribe-events-single)[^"]*"[^>]*>[\s\S]*?<\/(?:article|div|li)>/gi) ?? []

  for (const block of hEventBlocks) {
    const title = extractText(block, /class="[^"]*(?:p-name|summary|tribe-events-list-event-title|event-title|entry-title)[^"]*"[^>]*>([\s\S]*?)</)
    const dateStr = extractAttr(block, /(?:datetime|content)="(\d{4}-\d{2}-\d{2}[T\d:+-]*)"/i)
      ?? extractText(block, /class="[^"]*(?:dt-start|dtstart|tribe-event-schedule-details|event-date)[^"]*"[^>]*>([\s\S]*?)</)
    const desc = extractText(block, /class="[^"]*(?:p-description|description|tribe-events-list-event-description|event-description|entry-content)[^"]*"[^>]*>([\s\S]*?)</)
    const link = extractAttr(block, /href="(https?:\/\/[^"]+)"/)

    if (!title || !dateStr) continue

    const parsedDate = parseFlexibleDate(dateStr)
    if (!parsedDate || parsedDate < new Date()) continue

    events.push({
      source: 'local-network',
      source_id: `local-${hashStr(link ?? title + dateStr)}`,
      source_url: link,
      title: stripHtml(title).slice(0, 200),
      description: stripHtml(desc ?? '').slice(0, 500),
      organizer: org.name,
      location_name: `${org.name}, ${org.city}`,
      lat: org.lat,
      lng: org.lng,
      starts_at: parsedDate.toISOString(),
      cost: 'See event page',
    })
  }

  return events
}

/**
 * Extract events from WordPress / The Events Calendar (Tribe) markup.
 */
function extractWordPressEvents(html: string, baseUrl: string, org: LocalOrg): RawEvent[] {
  const events: RawEvent[] = []

  // Tribe Events JSON-LD often embedded separately
  const tribeMatch = html.match(/var defined_json_ld\s*=\s*(\[[\s\S]*?\]);/i)
    ?? html.match(/tribe-events-event-json-ld">([\s\S]*?)<\/script>/)
  if (tribeMatch?.[1]) {
    try {
      const data = JSON.parse(tribeMatch[1])
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item['@type'] !== 'Event') continue
        if (!item.name || !item.startDate) continue
        if (new Date(item.startDate) < new Date()) continue

        const loc = item.location ?? {}
        const geo = loc.geo ?? {}

        events.push({
          source: 'local-network',
          source_id: `local-${hashStr(item.url ?? item.name + item.startDate)}`,
          source_url: item.url ?? null,
          title: stripHtml(item.name),
          description: stripHtml(item.description ?? '').slice(0, 500),
          organizer: org.name,
          location_name: loc.name ?? `${org.name}, ${org.city}`,
          lat: parseFloat(geo.latitude ?? '0') || org.lat,
          lng: parseFloat(geo.longitude ?? '0') || org.lng,
          starts_at: new Date(item.startDate).toISOString(),
          ends_at: item.endDate ? new Date(item.endDate).toISOString() : null,
          cost: item.isAccessibleForFree ? 'Free' : 'See event page',
          image_url: typeof item.image === 'string' ? item.image : item.image?.url ?? null,
        })
      }
    } catch { /* skip */ }
  }

  // WP event list items: common patterns from popular WP calendar plugins
  const wpListItems = html.match(/<article[^>]*class="[^"]*(?:post-type-tribe_events|event_listing|ai1ec-event)[^"]*"[\s\S]*?<\/article>/gi) ?? []
  for (const block of wpListItems) {
    const title = extractText(block, /<h\d[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/)
      ?? extractText(block, /class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)</)
    const link = extractAttr(block, /<a\s+href="(https?:\/\/[^"]+)"/)
    const dateStr = extractAttr(block, /datetime="(\d{4}-\d{2}-\d{2}[T\d:+-]*)"/i)
      ?? extractText(block, /class="[^"]*(?:event-date|tribe-event-date-start)[^"]*"[^>]*>([\s\S]*?)</)

    if (!title || !dateStr) continue
    const parsedDate = parseFlexibleDate(dateStr)
    if (!parsedDate || parsedDate < new Date()) continue

    // Skip if already found via JSON-LD
    if (events.some(e => e.title === stripHtml(title))) continue

    events.push({
      source: 'local-network',
      source_id: `local-${hashStr(link ?? title + dateStr)}`,
      source_url: link,
      title: stripHtml(title).slice(0, 200),
      description: '',
      organizer: org.name,
      location_name: `${org.name}, ${org.city}`,
      lat: org.lat,
      lng: org.lng,
      starts_at: parsedDate.toISOString(),
      cost: 'See event page',
    })
  }

  return events
}

/**
 * Last-resort: extract events from generic HTML patterns.
 * Looks for date patterns near title-like elements.
 */
function extractGenericEvents(html: string, baseUrl: string, org: LocalOrg): RawEvent[] {
  const events: RawEvent[] = []
  const baseOrigin = new URL(baseUrl).origin

  // Common event card patterns
  const cardPatterns = [
    // <a> with date-like content nearby
    /<(?:div|li|article)[^>]*class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li|article)>/gi,
    // Eventbrite-style widget embeds
    /<div[^>]*data-widget-id[^>]*>([\s\S]*?)<\/div>/gi,
  ]

  for (const pattern of cardPatterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      const block = match[1] ?? match[0]
      const title = extractText(block, /<(?:h[1-6]|a|strong|b)[^>]*>([\s\S]*?)<\//)
      const link = extractAttr(block, /href="(\/[^"]+|https?:\/\/[^"]+)"/)
      const dateStr = extractAttr(block, /datetime="([^"]+)"/i)
        ?? extractText(block, /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i)
        ?? extractText(block, /(\d{4}-\d{2}-\d{2})/)

      if (!title || !dateStr) continue
      const parsedDate = parseFlexibleDate(dateStr)
      if (!parsedDate || parsedDate < new Date()) continue

      const fullLink = link?.startsWith('http') ? link : link ? `${baseOrigin}${link}` : null

      events.push({
        source: 'local-network',
        source_id: `local-${hashStr(fullLink ?? title + dateStr)}`,
        source_url: fullLink,
        title: stripHtml(title).slice(0, 200),
        description: '',
        organizer: org.name,
        location_name: `${org.name}, ${org.city}`,
        lat: org.lat,
        lng: org.lng,
        starts_at: parsedDate.toISOString(),
        cost: 'See event page',
      })
    }
  }

  return events
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractText(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern)
  return m?.[1] ? stripHtml(m[1]).trim() : null
}

function extractAttr(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern)
  return m?.[1]?.trim() ?? null
}

function parseFlexibleDate(str: string): Date | null {
  if (!str) return null

  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str)
    return isNaN(d.getTime()) ? null : d
  }

  // "21 March 2026" or "March 21, 2026"
  const d = new Date(str)
  if (!isNaN(d.getTime()) && d.getFullYear() > 2020) return d

  // European: "21/03/2026" or "21.03.2026"
  const euMatch = str.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/)
  if (euMatch) {
    const [, day, month, year] = euMatch
    const parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    return isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}

// ─── Exported Fetcher ───────────────────────────────────────────────────────

export const localNetworks: SourceFetcher = {
  name: 'local-networks',

  async fetch() {
    const seen = new Set<string>()
    const allEvents: RawEvent[] = []

    for (const org of LOCAL_ORGS) {
      for (const url of org.urls) {
        try {
          const events = await scrapeOrgPage(url, org)
          let added = 0
          for (const ev of events) {
            const key = ev.source_url ?? ev.source_id
            if (seen.has(key)) continue
            seen.add(key)
            allEvents.push(ev)
            added++
          }
          if (events.length > 0) {
            console.log(`[local-networks] ${org.name}: ${added} events from ${url}`)
          }
        } catch (err) {
          console.warn(`[local-networks] ${org.name}: failed ${url}:`, (err as Error).message)
        }
        await sleep(RATE_LIMIT_MS)
      }
    }

    console.log(`[local-networks] Total: ${allEvents.length} unique events from ${LOCAL_ORGS.length} organisations across ${new Set(LOCAL_ORGS.map(o => o.city)).size} cities`)
    return allEvents
  },
}

export { LOCAL_ORGS }
