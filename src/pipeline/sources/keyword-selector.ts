/**
 * Smart keyword selector — picks the most effective keywords per country.
 * Instead of 420 keywords × 220 cities (92,400 requests!), we pick
 * 12 high-signal keywords per city based on country and language.
 *
 * This makes the pipeline feasible within Vercel's 5-minute cron timeout.
 */

import type { City } from './cities'

/** Universal high-signal English keywords that work globally */
const CORE_KEYWORDS = [
  'permaculture',
  'community garden',
  'repair cafe',
  'seed swap',
  'transition town',
  'food forest',
  'zero waste',
  'foraging',
  'community choir',
  'drum circle',
  'open studio',
  'forest bathing',
]

/** Country-specific keywords in native language */
const COUNTRY_KEYWORDS: Record<string, string[]> = {
  Portugal: [
    'permacultura', 'horta comunitária', 'banco de sementes', 'repair café',
    'transição', 'floresta alimentar', 'desperdício zero', 'fermentação',
    'coro comunitário', 'estúdio aberto', 'banho de floresta', 'ecoterapia',
  ],
  Germany: [
    'Permakultur', 'Gemeinschaftsgarten', 'Saatguttausch', 'Repair Café',
    'Transition', 'Waldgarten', 'Trommelkreis', 'Folkabend',
    'offenes Atelier', 'Waldbaden', 'Klimatrauer', 'Solidarische Landwirtschaft',
  ],
  Austria: [
    'Permakultur', 'Gemeinschaftsgarten', 'Repair Café', 'Transition',
    'Saatguttausch', 'Waldgarten', 'Folkabend', 'offenes Atelier',
    'Waldbaden', 'Solidarische Landwirtschaft', 'Trommelkreis', 'Klimatrauer',
  ],
  Switzerland: [
    'Permakultur', 'Gemeinschaftsgarten', 'Repair Café', 'Waldgarten',
    'Saatguttausch', 'Transition', 'offenes Atelier', 'Waldbaden',
    'Folkabend', 'Solidarische Landwirtschaft', 'bain de forêt', 'atelier ouvert',
  ],
  France: [
    'permaculture', 'jardin partagé', 'repair café', 'grainothèque',
    'ville en transition', 'forêt comestible', 'zéro déchet', 'bal folk',
    'atelier ouvert', 'bain de forêt', 'chorale participative', 'disco soupe',
  ],
  Belgium: [
    'permaculture', 'jardin partagé', 'repair café', 'transition',
    'grainothèque', 'bal folk', 'gemeenschapstuin', 'folk sessie',
    'atelier ouvert', 'open atelier', 'ecotherapie', 'zéro déchet',
  ],
  Spain: [
    'permacultura', 'huerto comunitario', 'banco de semillas', 'repair café',
    'transición', 'bosque comestible', 'peña flamenca', 'taller abierto',
    'baño de bosque', 'coro comunitario', 'arte ecológico', 'fermentación',
  ],
  Italy: [
    'permacultura', 'orto comunitario', 'scambio semi', 'repair café',
    'transizione', 'foresta commestibile', 'coro comunitario', 'studio aperto',
    'bagno di foresta', 'arte ecologica', 'sessione folk', 'ecoterapia',
  ],
  Netherlands: [
    'permacultuur', 'volkstuin', 'zadenruil', 'repair café',
    'transitie', 'voedselbos', 'folk sessie', 'open atelier',
    'bosbaden', 'gemeenschapskoor', 'ecotherapie', 'trommelkring',
  ],
  Finland: [
    'permakulttuurin', 'yhteisöpuutarha', 'siemenvaihtopäivä', 'korjauskahvila',
    'siirtymäliike', 'ruokametsä', 'metsäkylpy', 'kansanmusiikki',
    'avoin ateljee', 'yhteislaulupiiri', 'luontoterapia', 'ilmastosurupiiri',
  ],
  Denmark: [
    'permakultur', 'fælles have', 'frøbyttedag', 'repair café',
    'omstilling', 'fødevareskov', 'skovbadning', 'folkemusik',
    'åbent atelier', 'fælles sang', 'naturterapi', 'klimasorggruppe',
  ],
  Ireland: [
    'permaculture', 'community garden', 'seed swap', 'repair café',
    'transition', 'food forest', 'trad session', 'céilí',
    'open studio', 'forest bathing', 'community choir', 'drum circle',
  ],
  'United Kingdom': [
    'permaculture', 'community garden', 'seed swap', 'repair café',
    'transition', 'food forest', 'folk session', 'Sacred Harp',
    'open studio', 'forest bathing', 'community choir', 'ceilidh',
  ],
  USA: [
    'permaculture', 'community garden', 'seed swap', 'repair cafe',
    'transition', 'food forest', 'sacred harp', 'drum circle',
    'open studio', 'forest bathing', 'community choir', 'mutual aid',
  ],
  Canada: [
    'permaculture', 'community garden', 'seed swap', 'repair café',
    'transition', 'food forest', 'folk session', 'drum circle',
    'open studio', 'forest bathing', 'community choir', 'mutual aid',
  ],
  Iceland: [
    'permaculture', 'permabygging', 'repair café', 'matarskógur',
    'umbreyting', 'endurreisn náttúru', 'þjóðlagasessía', 'trommuhringur',
    'opið vinnustofa', 'community garden', 'forest bathing', 'transition',
  ],
  Serbia: [
    'permakultura', 'zajednička bašta', 'razmena semena', 'repair café',
    'tranzicija', 'šuma hrane', 'folk sesija', 'bubnjarski krug',
    'otvoreni studio', 'ekoterapija', 'zajednički hor', 'kupanje u šumi',
  ],
  Slovenia: [
    'permakultura', 'skupnostni vrt', 'izmenjava semen', 'repair café',
    'prehod', 'prehranska gozd', 'folk seja', 'bobnarski krog',
    'odprta delavnica', 'gozdna kopel', 'skupnostni zbor', 'ekoterapija',
  ],
  Hungary: [
    'permakultura', 'közösségi kert', 'magcsere', 'repair café',
    'átmenet', 'ételerdő', 'folk zenei session', 'dobkör',
    'nyitott műterem', 'erdőfürdő', 'közösségi kórus', 'ökoterrápia',
  ],
  Luxembourg: [
    'permaculture', 'jardin partagé', 'repair café', 'transition',
    'Gemeinschaftsgarten', 'Permakultur', 'Saatguttausch', 'bal folk',
    'atelier ouvert', 'bain de forêt', 'chorale participative', 'zéro déchet',
  ],
  Malta: [
    'permaculture', 'community garden', 'seed swap', 'repair café',
    'transition', 'zero waste', 'drum circle', 'open studio',
    'forest bathing', 'community choir', 'foraging', 'composting',
  ],
}

/**
 * Get the best 12 keywords for a given city.
 * Uses native-language keywords when available, falls back to English core set.
 */
export function getKeywordsForCity(city: City): string[] {
  return COUNTRY_KEYWORDS[city.country] ?? CORE_KEYWORDS
}

/**
 * Get a rotating slice of cities for this cron run.
 * Each run processes a different batch of 20 cities, cycling through all.
 * Uses the day-of-year as the rotation index.
 */
export function getCityBatch(cities: City[], batchSize = 20): City[] {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  )
  const totalBatches = Math.ceil(cities.length / batchSize)
  const batchIndex = dayOfYear % totalBatches
  const start = batchIndex * batchSize
  return cities.slice(start, start + batchSize)
}
