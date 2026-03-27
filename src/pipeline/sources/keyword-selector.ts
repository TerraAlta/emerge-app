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

/** Extended English keywords covering ALL soul document dimensions */
const FULL_ENGLISH_KEYWORDS = [
  // Land & Nature
  'permaculture', 'food forest', 'community garden', 'seed swap', 'natural building',
  'rewilding', 'foraging', 'wild food', 'gleaning', 'composting', 'agroforestry',
  'habitat restoration', 'tree planting', 'regenerative agriculture', 'ecovillage',
  'allotment', 'beekeeping', 'mushroom growing', 'hedgerow planting',
  // Circular & Repair
  'repair cafe', 'repair café', 'zero waste', 'clothing swap', 'tool library',
  'upcycling', 'mending', 'bike repair', 'sewing repair', 'freecycle',
  // Food & Kitchen
  'fermentation', 'sourdough', 'community kitchen', 'disco soup', 'food sharing',
  'preserve making', 'bread baking community', 'community meal', 'potluck',
  'cooking together', 'surplus food', 'community feast', 'harvest supper',
  // Community & Economy
  'transition town', 'solidarity economy', 'time bank', 'community land trust',
  'mutual aid', 'cooperative', 'community assembly', 'degrowth',
  'doughnut economics', 'localisation', 'community energy',
  // Arts & Culture
  'theatre of the oppressed', 'forum theatre', 'community choir',
  'singing circle', 'drum circle', 'folk session', 'open mic community',
  'balfolk', 'ceilidh', 'Sacred Harp', 'community mural', 'open studio',
  'ecological art', 'land art', 'zine making', 'printmaking community',
  'community photography', 'participatory art',
  // Wellbeing & Nature Connection
  'forest bathing', 'forest therapy', 'shinrin-yoku', 'ecotherapy',
  'climate grief', 'eco-anxiety support', 'nature connection',
  'Work That Reconnects', 'contemplative walk', 'rites of passage',
  // Feast & Cultural
  'community iftar', 'Nowruz feast', 'harvest festival', 'apple pressing',
  'wassail', 'community dinner', 'cultural potluck',
]

/** Extended native-language keywords — full soul doc coverage */
const FULL_COUNTRY_KEYWORDS: Record<string, string[]> = {
  Portugal: [
    // Land & Nature
    'permacultura', 'floresta alimentar', 'horta comunitária', 'banco de sementes',
    'construção natural', 'renaturalização', 'colheita selvagem', 'compostagem',
    'agrofloresta', 'restauração habitat', 'plantação árvores', 'ecoaldeia',
    'apicultura', 'cogumelos', 'agricultura regenerativa',
    // Circular & Repair
    'repair café', 'desperdício zero', 'troca de roupa', 'reutilização',
    'reparação bicicletas', 'costura reparação',
    // Food & Kitchen
    'fermentação', 'cozinha comunitária', 'sopa comunitária', 'partilha alimentos',
    'pão artesanal', 'conservas', 'refeição comunitária', 'banquete comunitário',
    // Community & Economy
    'transição', 'economia solidária', 'banco tempo', 'cooperativa',
    'assembleia comunitária', 'energia comunitária', 'ajuda mútua',
    // Arts & Culture
    'teatro do oprimido', 'teatro fórum', 'coro comunitário', 'círculo percussão',
    'sessão folk', 'microfone aberto', 'estúdio aberto', 'arte ecológica',
    'mural comunitário', 'serigrafia', 'zine', 'fotografia comunitária',
    // Wellbeing
    'banho de floresta', 'ecoterapia', 'luto climático', 'conexão natureza',
    'caminhada contemplativa', 'círculo nascimento',
    // Feast
    'festa comunitária', 'jantar comunitário', 'festa colheita',
    // English fallbacks for international events in PT
    'permaculture', 'repair cafe', 'transition', 'food forest', 'drum circle',
    'open studio', 'forest bathing', 'community garden',
  ],
  Germany: [
    'Permakultur', 'Waldgarten', 'Gemeinschaftsgarten', 'Saatguttausch',
    'Natürliches Bauen', 'Wiederverwilderung', 'Wildpflanzen sammeln', 'Kompostierung',
    'Agroforstwirtschaft', 'Ökodorf', 'Imkerei', 'regenerative Landwirtschaft',
    'Repair Café', 'Zero Waste', 'Kleidertausch', 'Upcycling', 'Fahrradreparatur',
    'Fermentation', 'Gemeinschaftsküche', 'Schnippeldisko', 'Brotbacken',
    'Gemeinschaftsessen', 'Erntedankfest', 'Solidarische Landwirtschaft',
    'Transition', 'Solidarische Ökonomie', 'Zeitbank', 'Genossenschaft',
    'Gemeinschaftsenergie', 'Degrowth', 'Lokalisierung',
    'Theater der Unterdrückten', 'Forumtheater', 'Gemeinschaftschor',
    'Trommelkreis', 'Folkabend', 'offene Bühne', 'Balfolk',
    'offenes Atelier', 'ökologische Kunst', 'Gemeinschaftswandgemälde',
    'Siebdruck', 'Zine Workshop', 'partizipative Kunst',
    'Waldbaden', 'Waldtherapie', 'Ökotherapie', 'Klimatrauer',
    'Naturverbindung', 'kontemplative Wanderung',
    'permaculture', 'repair cafe', 'food forest', 'drum circle', 'open studio',
  ],
  France: [
    'permaculture', 'forêt comestible', 'jardin partagé', 'grainothèque',
    'construction naturelle', 'réensauvagement', 'cueillette sauvage', 'compostage',
    'agroforesterie', 'écovillage', 'apiculture', 'agriculture régénérative',
    'repair café', 'zéro déchet', 'troc vêtements', 'recyclerie', 'vélo réparation',
    'fermentation', 'cuisine collective', 'disco soupe', 'pain au levain',
    'repas communautaire', 'fête des récoltes', 'conserves',
    'ville en transition', 'économie solidaire', 'banque de temps', 'coopérative',
    'assemblée citoyenne', 'énergie communautaire', 'décroissance',
    'théâtre de l\'opprimé', 'théâtre forum', 'chorale participative',
    'cercle de percussions', 'bal folk', 'scène ouverte',
    'atelier ouvert', 'art écologique', 'fresque communautaire',
    'sérigraphie', 'zine atelier', 'art participatif',
    'bain de forêt', 'écothérapie', 'deuil climatique', 'connexion nature',
    'marche contemplative', 'cercle naissance',
    'fest-noz', 'veillée musicale', 'bœuf musical',
    'repair cafe', 'transition', 'drum circle', 'open studio', 'forest bathing',
  ],
  Spain: [
    'permacultura', 'bosque comestible', 'huerto comunitario', 'banco de semillas',
    'construcción natural', 'renaturalización', 'recolección silvestre', 'compostaje',
    'agroforestería', 'ecoaldea', 'apicultura', 'agricultura regenerativa',
    'repair café', 'residuo cero', 'intercambio ropa', 'reutilización',
    'fermentación', 'cocina comunitaria', 'comida comunitaria', 'pan artesanal',
    'fiesta cosecha', 'conservas', 'cena comunitaria',
    'transición', 'economía solidaria', 'banco de tiempo', 'cooperativa',
    'asamblea comunitaria', 'energía comunitaria', 'decrecimiento',
    'teatro del oprimido', 'teatro foro', 'coro comunitario',
    'círculo percusión', 'peña flamenca', 'sesión folk', 'micrófono abierto',
    'taller abierto', 'arte ecológico', 'mural comunitario',
    'serigrafía', 'zine taller', 'arte participativo',
    'baño de bosque', 'ecoterapia', 'duelo climático', 'conexión naturaleza',
    'sardana', 'habaneras', 'trikitixa',
    'permaculture', 'repair cafe', 'transition', 'drum circle', 'forest bathing',
  ],
  Italy: [
    'permacultura', 'foresta commestibile', 'orto comunitario', 'scambio semi',
    'costruzione naturale', 'rinaturalizzazione', 'raccolta selvatica', 'compostaggio',
    'agroforestazione', 'ecovillaggio', 'apicoltura', 'agricoltura rigenerativa',
    'repair café', 'rifiuti zero', 'scambio vestiti', 'riutilizzo',
    'fermentazione', 'cucina comunitaria', 'pasto comunitario', 'pane artigianale',
    'festa raccolto', 'conserve', 'cena comunitaria',
    'transizione', 'economia solidale', 'banca del tempo', 'cooperativa',
    'assemblea comunitaria', 'energia comunitaria', 'decrescita',
    'teatro dell\'oppresso', 'teatro forum', 'coro comunitario',
    'cerchio percussione', 'sessione folk', 'microfono aperto',
    'studio aperto', 'arte ecologica', 'murale comunitario',
    'serigrafia', 'zine laboratorio', 'arte partecipativa',
    'bagno di foresta', 'ecoterapia', 'lutto climatico', 'connessione natura',
    'permaculture', 'repair cafe', 'transition', 'drum circle', 'forest bathing',
  ],
  Netherlands: [
    'permacultuur', 'voedselbos', 'volkstuin', 'gemeenschapstuin', 'zadenruil',
    'natuurlijk bouwen', 'verwildering', 'wildplukken', 'composteren',
    'agrobosbouw', 'ecodorp', 'bijenteelt', 'regeneratieve landbouw',
    'repair café', 'zero waste', 'kledingruil', 'upcycling', 'fietsreparatie',
    'fermentatie', 'gemeenschapskeuken', 'brood bakken', 'gemeenschapsmaaltijd',
    'oogstfeest', 'voedseldelen', 'buurtmaaltijd',
    'transitie', 'solidaire economie', 'tijdbank', 'coöperatie',
    'buurtenergie', 'degrowth', 'lokalisatie',
    'theater van de onderdrukten', 'gemeenschapskoor', 'trommelkring',
    'folk sessie', 'open podium', 'balfolk',
    'open atelier', 'ecologische kunst', 'gemeenschapsschildering',
    'zeefdruk', 'zine workshop', 'participatieve kunst',
    'bosbaden', 'ecotherapie', 'klimaatrouw', 'natuurverbinding',
    'contemplatieve wandeling',
    'permaculture', 'repair cafe', 'transition', 'drum circle', 'forest bathing',
  ],
  'United Kingdom': [
    'permaculture', 'food forest', 'community garden', 'seed swap', 'allotment',
    'natural building', 'rewilding', 'foraging', 'wild food', 'gleaning',
    'composting', 'hedge laying', 'coppicing', 'orchard', 'apple pressing',
    'repair cafe', 'zero waste', 'clothing swap', 'tool library', 'upcycling',
    'bike repair', 'mending circle',
    'fermentation', 'sourdough', 'community kitchen', 'disco soup',
    'bread baking', 'community meal', 'surplus food', 'harvest supper', 'wassail',
    'transition town', 'solidarity economy', 'time bank', 'community land trust',
    'mutual aid', 'cooperative', 'community energy', 'degrowth',
    'theatre of the oppressed', 'forum theatre', 'community choir',
    'singing circle', 'drum circle', 'folk session', 'ceilidh',
    'Sacred Harp', 'shape note', 'open mic community', 'singaround', 'balfolk',
    'open studio', 'community mural', 'ecological art', 'land art',
    'zine making', 'printmaking community', 'screen printing',
    'forest bathing', 'ecotherapy', 'climate grief', 'eco-anxiety support',
    'nature connection', 'Work That Reconnects', 'contemplative walk',
    'community iftar', 'community feast', 'cultural potluck',
  ],
  Ireland: [
    'permaculture', 'food forest', 'community garden', 'seed swap', 'allotment',
    'natural building', 'rewilding', 'foraging', 'wild food', 'composting',
    'repair café', 'zero waste', 'clothing swap', 'upcycling',
    'fermentation', 'community kitchen', 'sourdough', 'community meal',
    'transition', 'solidarity economy', 'time bank', 'cooperative', 'mutual aid',
    'trad session', 'céilí', 'set dancing', 'community choir', 'singing circle',
    'drum circle', 'open mic community', 'singaround', 'bodhrán workshop',
    'open studio', 'community mural', 'ecological art', 'printmaking',
    'forest bathing', 'ecotherapy', 'climate grief', 'nature connection',
    'permacultura', 'coille-bìdh', 'iomlaid sìl',
    'community feast', 'harvest supper', 'apple pressing',
  ],
  USA: [
    'permaculture', 'food forest', 'community garden', 'seed swap',
    'natural building', 'rewilding', 'foraging', 'wild food', 'gleaning',
    'composting', 'regenerative agriculture', 'ecovillage',
    'repair cafe', 'zero waste', 'clothing swap', 'tool library', 'upcycling',
    'fermentation', 'community kitchen', 'sourdough', 'community meal',
    'mutual aid', 'transition', 'solidarity economy', 'time bank',
    'community land trust', 'cooperative', 'degrowth',
    'sacred harp', 'shape note', 'drum circle', 'community choir',
    'folk session', 'irish session', 'open mic community',
    'open studio', 'community mural', 'ecological art', 'zine making',
    'printmaking community', 'participatory art',
    'forest bathing', 'ecotherapy', 'climate grief', 'eco-anxiety support',
    'nature connection', 'community iftar', 'community feast', 'potluck',
  ],
  Canada: [
    'permaculture', 'food forest', 'community garden', 'seed swap',
    'natural building', 'rewilding', 'foraging', 'wild food', 'composting',
    'repair café', 'zero waste', 'clothing swap', 'tool library',
    'fermentation', 'community kitchen', 'sourdough', 'community meal',
    'transition', 'mutual aid', 'solidarity economy', 'time bank', 'cooperative',
    'drum circle', 'community choir', 'folk session', 'irish session',
    'sacred harp', 'open mic community',
    'open studio', 'community mural', 'ecological art', 'zine making',
    'forest bathing', 'ecotherapy', 'climate grief', 'nature connection',
    'community feast', 'potluck', 'harvest supper',
    'jardin partagé', 'permaculture', 'repair café', 'chorale participative',
  ],
  Finland: [
    'permakulttuurin', 'ruokametsä', 'yhteisöpuutarha', 'siemenvaihtopäivä',
    'luonnonrakentaminen', 'uudelleenviljely', 'villiyrttien keruu', 'kompostointi',
    'korjauskahvila', 'nollajäte', 'vaatteidenvaihto',
    'fermentointi', 'yhteisökeittiö', 'yhteisöateria', 'hapanjuurileipä',
    'siirtymäliike', 'solidaarisuustalous', 'aikapankki', 'osuuskunta',
    'kansanmusiikki sessio', 'yhteislaulupiiri', 'rumpupiiri',
    'avoin ateljee', 'ekologinen taide', 'yhteisömaalaus',
    'metsäkylpy', 'luontoterapia', 'ilmastosurupiiri', 'luontoyhteys',
    'permaculture', 'repair cafe', 'transition', 'drum circle', 'forest bathing',
    'community garden', 'folk session', 'open studio',
  ],
  Denmark: [
    'permakultur', 'fødevareskov', 'fælles have', 'frøbyttedag',
    'naturligt byggeri', 'rewilding', 'vild mad', 'kompostering',
    'repair café', 'nul affald', 'tøjbyttemarked',
    'fermentering', 'fælleskøkken', 'fællesspisning', 'surdejsbrød',
    'omstilling', 'solidarisk økonomi', 'tidbank', 'kooperativ',
    'folkemusik session', 'fælles sang', 'trommekrebs',
    'åbent atelier', 'økologisk kunst', 'fællesskabsmaleri',
    'skovbadning', 'naturterapi', 'klimasorggruppe', 'naturrelation',
    'permaculture', 'repair cafe', 'transition', 'drum circle', 'forest bathing',
    'community garden', 'folk session', 'open studio',
  ],
  Iceland: [
    'permaculture', 'permabygging', 'samfélagsgarður', 'fræskipti',
    'náttúrulegt byggingarfræði', 'endurreisn náttúru', 'villt matur',
    'repair café', 'núll sorp',
    'gerjun', 'samfélagseldhús', 'samfélagsveisla',
    'umbreyting', 'samstæðuhagkerfi', 'tímabanki',
    'þjóðlagasessía', 'trommuhringur', 'samfélagskór', 'söngfundur',
    'opið vinnustofa', 'vistfræðileg list', 'samfélagsmynd',
    'vistmeðferð', 'loftslagssorg', 'náttúrutengsl',
    'community garden', 'transition', 'drum circle', 'forest bathing',
  ],
  Serbia: [
    'permakultura', 'šuma hrane', 'zajednička bašta', 'razmena semena',
    'prirodna gradnja', 'obnova divljine', 'divlja hrana', 'kompostiranje',
    'repair café', 'nula otpada', 'razmena odeće',
    'fermentacija', 'zajednička kuhinja', 'zajednički obrok',
    'tranzicija', 'solidarna ekonomija', 'časovna banka', 'zadruga',
    'folk sesija', 'bubnjarski krug', 'zajednički hor',
    'pozorište potlačenih', 'forum teatar',
    'otvoreni studio', 'ekološka umetnost', 'zajednički mural',
    'kupanje u šumi', 'ekoterapija', 'klimatska tuga',
    'permaculture', 'repair cafe', 'transition', 'drum circle', 'forest bathing',
  ],
  Slovenia: [
    'permakultura', 'prehranska gozd', 'skupnostni vrt', 'izmenjava semen',
    'naravna gradnja', 'ponovitev divjine', 'divja hrana', 'kompostiranje',
    'repair café', 'nič odpadkov', 'izmenjava oblačil',
    'fermentacija', 'skupnostna kuhinja', 'skupnostni obrok',
    'prehod', 'solidarnostno gospodarstvo', 'časovna banka', 'zadruga',
    'folk seja', 'bobnarski krog', 'skupnostni zbor',
    'gledališče zatiranih',
    'odprta delavnica', 'ekološka umetnost', 'skupnostna poslikava',
    'gozdna kopel', 'ekoterapija', 'podnebna žalost',
    'permaculture', 'repair cafe', 'transition', 'drum circle', 'forest bathing',
  ],
  Hungary: [
    'permakultura', 'ételerdő', 'közösségi kert', 'magcsere',
    'természetes építés', 'vadon visszaállítása', 'vadételek', 'komposztálás',
    'repair café', 'zero hulladék', 'ruhacserebere',
    'erjesztés', 'közösségi konyha', 'közösségi étkezés',
    'átmenet', 'szolidáris gazdaság', 'időbank', 'szövetkezet',
    'folk zenei session', 'dobkör', 'közösségi kórus',
    'elnyomottak színháza', 'fórum színház',
    'nyitott műterem', 'ökológiai művészet', 'közösségi falfestmény',
    'erdőfürdő', 'ökoterrápia', 'éghajlati gyász',
    'permaculture', 'repair cafe', 'transition', 'drum circle', 'forest bathing',
  ],
  Luxembourg: [
    'permaculture', 'jardin partagé', 'repair café', 'grainothèque',
    'forêt comestible', 'zéro déchet', 'fermentation', 'cuisine collective',
    'ville en transition', 'économie solidaire', 'banque de temps',
    'chorale participative', 'bal folk', 'cercle percussions',
    'atelier ouvert', 'art écologique',
    'bain de forêt', 'écothérapie', 'deuil climatique',
    'Permakultur', 'Gemeinschaftsgarten', 'Saatguttausch', 'Repair Café',
    'Waldgarten', 'Waldbaden', 'offenes Atelier',
    'community garden', 'transition', 'drum circle', 'forest bathing',
  ],
  Belgium: [
    'permaculture', 'jardin partagé', 'repair café', 'grainothèque',
    'forêt comestible', 'zéro déchet', 'fermentation', 'disco soupe',
    'ville en transition', 'économie solidaire', 'banque de temps',
    'théâtre de l\'opprimé', 'chorale participative', 'bal folk',
    'atelier ouvert', 'art écologique', 'fresque communautaire',
    'bain de forêt', 'écothérapie', 'deuil climatique',
    'gemeenschapstuin', 'volkstuin', 'zadenruil', 'transitie',
    'folk sessie', 'open atelier', 'bosbaden', 'ecotherapie',
    'voedselbos', 'gemeenschapskoor', 'trommelkring',
    'community garden', 'drum circle', 'forest bathing',
  ],
  Switzerland: [
    'Permakultur', 'Waldgarten', 'Gemeinschaftsgarten', 'Saatguttausch',
    'Natürliches Bauen', 'Wiederverwilderung', 'Kompostierung',
    'Repair Café', 'Zero Waste', 'Kleidertausch',
    'Fermentation', 'Gemeinschaftsküche', 'Solidarische Landwirtschaft',
    'Transition', 'Solidarische Ökonomie', 'Zeitbank', 'Genossenschaft',
    'Gemeinschaftschor', 'Trommelkreis', 'Folkabend', 'Balfolk',
    'offenes Atelier', 'ökologische Kunst',
    'Waldbaden', 'Waldtherapie', 'Klimatrauer',
    'permaculture', 'forêt comestible', 'jardin partagé',
    'bal folk', 'atelier ouvert', 'bain de forêt', 'écothérapie',
    'repair cafe', 'transition', 'drum circle', 'forest bathing',
  ],
  Malta: [
    'permaculture', 'community garden', 'seed swap', 'repair café',
    'zero waste', 'composting', 'foraging', 'food forest',
    'fermentation', 'community kitchen', 'community meal',
    'transition', 'cooperative', 'mutual aid',
    'drum circle', 'community choir', 'open mic community',
    'open studio', 'ecological art', 'community mural',
    'forest bathing', 'ecotherapy', 'nature connection',
    'community feast', 'cultural potluck', 'harvest festival',
  ],
}

/**
 * Get 12 high-signal keywords for Vercel cron (fast, light refresh).
 */
export function getKeywordsForCity(city: City): string[] {
  return COUNTRY_KEYWORDS[city.country] ?? CORE_KEYWORDS
}

/**
 * Get FULL keyword set for local pipeline runs (no time limit).
 * Combines native-language keywords + ALL English keywords, deduplicated.
 * This is the maximum coverage — every soul document dimension in every language.
 */
export function getFullKeywordsForCity(city: City): string[] {
  const native = FULL_COUNTRY_KEYWORDS[city.country] ?? []
  const combined = [...native, ...FULL_ENGLISH_KEYWORDS]
  // Deduplicate (case-insensitive)
  const seen = new Set<string>()
  return combined.filter(k => {
    const lower = k.toLowerCase()
    if (seen.has(lower)) return false
    seen.add(lower)
    return true
  })
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
