/**
 * Terre de Liens — terredeliens.org (Wagtail site, no /agenda page).
 *
 * Events are "actu" pages tagged "Évènements". Each region's news listing
 * (/<region>/actu/, Midi-Pyrénées uses /hub-actus-…/) and the national one
 * render cards like:
 *   <a href="…/actu/…">
 *     <span class="font-tag …">06 octobre 2026 | 17h00</span>
 *     <span class="… text-small-medium">Évènements</span>
 *     <h3>Invitation : du théâtre à la ferme</h3>
 *     <div><span>Ferme des croquants, La Bastide Besplas</span>
 *          <span>Tout public</span><span> 4h</span></div>
 *   </a>
 * The badge is the event start (Europe/Paris); the last span is the
 * duration ("4h", "3h30", "47 jours") which gives the end. Cards without a
 * badge are old (pre-2023) posts and are skipped. We only read the plain
 * listing URLs — robots.txt disallows the ?categorie= / ?page= variants.
 * 20 listing requests; venues geocoded (cached). Visio events skipped.
 *
 * Caveat: some badges carry a placeholder time (e.g. "14h52") when the
 * editor only cared about the date; we keep the published value.
 */
import * as cheerio from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { hashStr } from './utils'
import { getText, parisIso, frMonth, geocodeFrFirst, ONLINE_RE } from './fr-common'

const SRC = 'terredeliens-fr'
const BASE = 'https://terredeliens.org'
const LISTINGS = [
  'national/actu', 'alsace/actu', 'aquitaine/actu', 'auvergne/actu', 'bourgogne-franche-comt%C3%A9/actu',
  'bretagne/actu', 'centre/actu', 'champagne-ardenne/actu', 'corse/actu', 'hauts-de-france/actu',
  'ile-de-france/actu', 'limousin/actu', 'lorraine/actu', 'languedoc-roussillon/actu',
  'midi-pyrenees/hub-actus-midi-pyr%C3%A9n%C3%A9e%C3%A9s', 'normandie/actu', 'pays-de-la-loire/actu',
  'poitou-charentes/actu', 'provence-alpes-c%C3%B4te-dazur/actu', 'rhone-alpes/actu',
]
const REGION_NAME: Record<string, string> = {
  alsace: 'Alsace', aquitaine: 'Aquitaine', auvergne: 'Auvergne', 'bourgogne-franche-comt%C3%A9': 'Bourgogne-Franche-Comté',
  bretagne: 'Bretagne', centre: 'Centre-Val de Loire', 'champagne-ardenne': 'Champagne-Ardenne', corse: 'Corse',
  'hauts-de-france': 'Hauts-de-France', 'ile-de-france': 'Île-de-France', limousin: 'Limousin', lorraine: 'Lorraine',
  'languedoc-roussillon': 'Occitanie', 'midi-pyrenees': 'Occitanie', normandie: 'Normandie',
  'pays-de-la-loire': 'Pays de la Loire', 'poitou-charentes': 'Nouvelle-Aquitaine',
  'provence-alpes-c%C3%B4te-dazur': "Provence-Alpes-Côte d'Azur", 'rhone-alpes': 'Auvergne-Rhône-Alpes',
}
const MAX_EVENTS = 200

interface Card {
  url: string
  title: string
  badge: string
  where: string
  audience: string
  duration: string
  image: string | null
  region: string
}

/** "06 octobre 2026 17h00" → ISO UTC (Paris). Time optional. */
function parseBadge(s: string): string | null {
  const m = s.match(/(\d{1,2})\s+([a-zéèûô.]+)\s+(\d{4})(?:\D+(\d{1,2})\s*[h:]\s*(\d{2})?)?/i)
  if (!m) return null
  const mo = frMonth(m[2])
  if (!mo) return null
  return parisIso(+m[3], mo, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)
}

/** "4h", "3h30", "47 jours", "2 jours" → milliseconds (null if absent/invalid). */
function parseDuration(s: string): number | null {
  const d = s.match(/^\s*(\d+)\s*jours?\s*$/i)
  if (d) return +d[1] * 86400000
  const h = s.match(/^\s*(\d+)\s*h\s*(\d{2})?\s*$/i)
  if (h) return (+h[1] * 60 + (h[2] ? +h[2] : 0)) * 60000
  return null
}

function parseListing(html: string, region: string): Card[] {
  const $ = cheerio.load(html)
  const out: Card[] = []
  $('a[href]').each((_, a) => {
    const el = $(a)
    const tag = el.find('span.text-small-medium').first().text().trim()
    if (!/^[ÉE]v[èe]nements?$/i.test(tag)) return
    const badge = el.find('.font-tag').first().text().replace(/\s+/g, ' ').trim()
    if (!badge) return
    const title = el.find('h3').first().text().replace(/\s+/g, ' ').trim()
    if (!title) return
    const spans = el.find('h3').nextAll('div').first().find('span').toArray().map((s) => $(s).text().replace(/\s+/g, ' ').trim())
    const img = el.find('img').first().attr('src') || null
    out.push({
      url: new URL(el.attr('href')!, BASE).toString(),
      title,
      badge,
      where: spans[0] ?? '',
      audience: spans[1] ?? '',
      duration: spans[2] ?? '',
      image: img,
      region,
    })
  })
  return out
}

export const terredeliensFr: SourceFetcher = {
  name: SRC,
  async fetch() {
    const cards = new Map<string, Card>()
    for (const path of LISTINGS) {
      const html = await getText(`${BASE}/${path}/`)
      if (!html) continue
      const region = REGION_NAME[path.split('/')[0]] ?? ''
      for (const c of parseListing(html, region)) {
        const prev = cards.get(c.url)
        if (!prev || (!prev.region && c.region)) cards.set(c.url, c)
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    const now = Date.now()
    const events: RawEvent[] = []
    for (const c of cards.values()) {
      if (events.length >= MAX_EVENTS) break
      const start = parseBadge(c.badge)
      if (!start || new Date(start).getTime() < now) continue
      if (ONLINE_RE.test(`${c.title} ${c.where}`)) continue
      if (!c.where) continue

      // "Ferme des croquants, La Bastide Besplas" / "Savoie" / "Redon, Ille-et-Vilaine"
      const parts = c.where.split(',').map((s) => s.trim()).filter(Boolean)
      const noParen = c.where.replace(/\([^)]*\)/g, ' ')
      const geo = await geocodeFrFirst([
        c.where,
        parts.slice(1).join(', '),
        parts[parts.length - 1] ?? '',
        parts[0] ?? '',
        noParen,
        c.where.match(/\(([^)]+)\)/)?.[1]?.replace(/\b(Normandie|France)\b/gi, '') ?? '',
      ].filter((q) => q && !/plusieurs/i.test(q)))
      if (!geo) continue

      const dur = parseDuration(c.duration)
      const end = dur && dur > 0 ? new Date(new Date(start).getTime() + dur).toISOString() : null
      events.push({
        source: SRC,
        source_id: `tdl-${hashStr(c.url)}`,
        source_url: c.url,
        title: c.title,
        description: [
          c.title,
          c.audience ? `Public : ${c.audience}.` : '',
          `Lieu : ${c.where}.`,
          `Terre de Liens${c.region ? ` ${c.region}` : ''}.`,
        ].filter(Boolean).join(' ').slice(0, 500),
        organizer: `Terre de Liens${c.region ? ` ${c.region}` : ''}`,
        location_name: c.where.slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: start,
        ends_at: end,
        cost: 'Voir l’événement',
        image_url: c.image,
      })
    }
    return events
  },
}
