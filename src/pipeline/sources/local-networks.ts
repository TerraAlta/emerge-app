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
