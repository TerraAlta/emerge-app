/**
 * Pre-filter: keyword-based relevance check applied BEFORE AI scoring.
 *
 * Cost-critical. Rejects ~94% of obviously irrelevant events before they
 * reach Claude, keeping the weekly pipeline within the design budget
 * (~€2-5/week). Every source that scrapes large open catalogues
 * (Eventbrite, AllEvents, Meetup, etc.) MUST run events through this
 * filter before calling scoreQuest().
 *
 * If you add a new "search the whole web" source, add it to the
 * pre-filter call site in orchestrator.ts — do not bypass.
 */

// English + all native language keywords from soul document dimensions
const RELEVANCE_KEYWORDS = new RegExp([
  // English core
  'permacultur', 'transition', 'repair.caf', 'seed.swap', 'food.forest',
  'community.garden', 'allotment', 'compost', 'ferment', 'sourdough',
  'zero.waste', 'circular', 'upcycl', 'rewild', 'forag', 'gleaning',
  'harvest', 'orchard', 'cider', 'apple.press', 'wassail', 'eco.?village',
  'co.?housing', 'intentional.community', 'skill.?share', 'tool.library',
  'clothing.swap', 'free.shop', 'give.?away', 'mutual.aid', 'solidarity',
  'cooperativ', 'commons', 'degrowth', 'doughnut.econom', 'local.econom',
  'timebank', 'community.land', 'CSA', 'organic.farm', 'agroecolog',
  'biodynamic', 'forest.garden', 'food.sovereig', 'seed.librar', 'seed.sav',
  'herb.?walk', 'wild.food', 'medicinal.plant', 'natural.build', 'cob.build',
  'straw.?bale', 'earth.?build', 'roundwood', 'green.wood', 'timber.frame',
  'community.choir', 'drum.circle', 'folk.session', 'trad.session',
  'irish.session', 'balfolk', 'ceilidh', 'singaround', 'sacred.harp',
  'shape.note', 'open.mic', 'jam.session', 'singing.circle', 'community.music',
  'open.studio', 'community.mural', 'land.art', 'climate.art', 'ecological.art',
  'zine', 'printmak', 'screen.print', 'art.collective', 'participat.art',
  'artist.residen', 'forum.theatre', 'theatre.of.the.oppressed', 'playback.theatre',
  'community.theatre', 'storytell', 'puppet', 'social.circus',
  'repair', 'fix.?it', 'mend', 'bike.kitchen', 'hack.?space', 'maker.?space',
  'fab.?lab', 'wood.?work', 'community.kitchen', 'cooking.together',
  'community.meal', 'potluck', 'feast', 'disco.soup', 'surplus', 'rescued.food',
  'food.?cycle', 'community.fridge', 'pay.what.you', 'iftar', 'nowruz',
  'eid.feast', 'diwali', 'lunar.new.year', 'harvest.supper', 'community.table',
  'shared.meal', 'forest.bath', 'shinrin.?yoku', 'ecotherap', 'nature.connection',
  'climate.grief', 'eco.?anxiety', 'work.that.reconnects', 'contemplative.walk',
  'grief.circle', 'rites.of.passage', 'nature.immersion', 'solastalgia',
  // Portuguese
  'horta', 'comunitári', 'banco.de.sementes', 'floresta.alimentar',
  'desperdício.zero', 'coro.comunitário', 'estúdio.aberto', 'banho.de.floresta',
  'ecoterapia', 'transição', 'arte.ecológic', 'mural.comunitári',
  'sessão.de.fado', 'círculo.de.percussão', 'oficina.de.música',
  'cante.alentejano', 'rancho.folclórico', 'atelier.aberto',
  // German
  'Gemeinschaftsgarten', 'Saatguttausch', 'Waldgarten', 'Lebensmittelwald',
  'Null.Abfall', 'Gemeinschaftschor', 'offenes.Atelier', 'Waldtherapie',
  'Waldbaden', 'Klimatrauer', 'Ökotherapie', 'Naturverbindung',
  'Folkabend', 'Trommelkreis', 'offene.Jam', 'Singrunde', 'Volksmusik',
  'ökologische.Kunst', 'Klimakunst', 'Kunstkollektiv', 'Druckwerkstatt',
  'Gemeinschaftswandgemälde', 'Übergangsriten', 'Streuobst', 'Mosterei',
  'Schnippeldisko', 'Reparatur', 'Werkstatt',
  // French
  'jardin.partagé', 'jardin.communautaire', 'grainothèque', 'forêt.nourricière',
  'zéro.déchet', 'chorale.communautaire', 'atelier.ouvert', 'bain.de.forêt',
  'écothérapie', 'deuil.climatique', 'fest.noz', 'bal.folk', 'session.irlandaise',
  'cercle.de.percussions', 'veillée.musicale', 'chant.collectif',
  'fresque.communautaire', 'art.écologique', 'art.climatique', 'sérigraphie',
  'résidence.artistique', 'atelier.musique',
  // Spanish
  'huerto.comunitario', 'intercambio.de.semillas', 'bosque.de.alimentos',
  'cero.residuos', 'coro.comunitario', 'taller.abierto', 'baño.de.bosque',
  'ecoterapia', 'duelo.climático', 'peña.flamenca', 'taller.de.percusión',
  'sardana', 'habaneras', 'trikitixa', 'arte.ecológico', 'mural.comunitario',
  'arte.participativo', 'serigrafía',
  // Italian
  'orto.comunitario', 'scambio.semi', 'foresta.alimentare', 'rifiuti.zero',
  'coro.comunitario', 'studio.aperto', 'bagno.di.foresta', 'ecoterapia',
  'lutto.climatico', 'sessione.folk', 'cerchio.di.percussione',
  'musica.tradizionale', 'arte.ecologica', 'murale.comunitario', 'serigrafia',
  // Dutch
  'volkstuin', 'gemeenschapstuin', 'zadenruil', 'voedselbos', 'nul.afval',
  'gemeenschapskoor', 'open.atelier', 'bosbaden', 'ecotherapie',
  'klimaatrouw', 'natuurverbinding', 'folk.sessie', 'trommelkring',
  'samenzang', 'ecologische.kunst', 'gemeenschapsschildering', 'zeefdruk',
  // Danish
  'fælles.have', 'frøbytte', 'madsskov', 'nul.affald', 'fællessang',
  'skovbadning', 'naturterapi', 'klimasorg', 'folkemusik', 'trommekrebs',
  'åbent.atelier', 'fællesskabsmaleri', 'økologisk.kunst', 'klimakunst',
  // Finnish
  'yhteisöpuutarha', 'siemenvaihto', 'ruokametsä', 'nollahukkaa',
  'yhteislaulupiiri', 'metsäkylpy', 'luontoterapia', 'ilmastosurupiiri',
  'kansanmusiikki', 'rumpupiiri', 'avoin.ateljee', 'ekologinen.taide',
  // Icelandic
  'permabygging', 'umbreyting', 'matarskógur', 'fræskipti', 'núll.sorp',
  'samfélagskór', 'vistmeðferð', 'loftslagssorg', 'þjóðlagasessía',
  'trommuhringur', 'opið.vinnustofa', 'vistfræðileg.list',
  // Serbian
  'permakultura', 'tranzicija', 'šuma.hrane', 'razmena.semena',
  'nula.otpada', 'zajednički.hor', 'ekoterapija', 'klimatska.tuga',
  'folk.sesija', 'bubnjarski.krug', 'otvoreni.studio', 'ekološka.umetnost',
  // Slovenian
  'permakultura', 'prehod', 'prehranska.gozd', 'izmenjava.semen',
  'nič.odpadkov', 'skupnostni.zbor', 'ekoterapija', 'podnebna.žalost',
  'gozdna.kopel', 'bobnarski.krog', 'odprta.delavnica', 'ekološka.umetnost',
  // Hungarian
  'permakultura', 'átmenet', 'ételerdő', 'magcsere', 'zero.hulladék',
  'közösségi.kórus', 'ökoterrápia', 'éghajlati.gyász', 'erdőfürdő',
  'folk.zenei', 'dobkör', 'nyitott.műterem', 'ökológiai.művészet',
  // Welsh
  'sesiwn.werin', 'côr.cymunedol', 'stiwdio.agored', 'murlun.cymunedol',
  'celf.ecolegol',
  // Scots Gaelic
  'coille.bìdh', 'iomlaid.sìl', 'còisir.choimhearsnachd',
  // Irish
  'ceardlann', 'comharchumann', 'gairdín.pobail',
  // Maltese
  'permacultura', 'bidla.taż.żerriegħa',
].join('|'), 'i')

const EXCLUDE_KEYWORDS = /webinar|online.only|virtual.event|zoom.meeting|live.?stream|corporate.wellness|team.building.corporate|networking.mixer|pitch.night|startup|venture.capital|blockchain|crypto|NFT|marketing.workshop|sales.training|real.estate|property.investment|stock.market|forex|trading|MBA|business.school|golf|yacht|luxury|k.?pop/i

/**
 * Returns true if the event is plausibly relevant and worth AI-scoring.
 * Returns false to skip — saves a Claude API call.
 *
 * Designed to be conservative: false negatives (skipping a relevant event)
 * are cheap; false positives (paying to score garbage) are not.
 */
export function isPotentiallyRelevant(event: { title: string; description?: string }): boolean {
  const text = `${event.title} ${event.description ?? ''}`.toLowerCase()
  if (EXCLUDE_KEYWORDS.test(text)) return false
  if (RELEVANCE_KEYWORDS.test(text)) return true
  return false
}
