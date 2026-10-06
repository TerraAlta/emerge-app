/**
 * Enercoop — enercoop.fr/blog/evenements
 * Renewable-energy cooperative network: regional co-ops' events — Randowatt
 * walks to solar parks, inaugurations, member apéros, public meetings,
 * festivals and fairs where the local co-op holds a stand.
 *
 * The listing (newest-dated first, upcoming ones on top) has cards with a
 * dd/mm/yyyy date, title and teaser. Each upcoming event's page has a
 * "date-et-lieu-evenement" block (French date, sometimes a range, and a
 * free-text place). Times are rarely structured: we take the first explicit
 * "à 18h" / "de 10h30" / "10h :" in the teaser or body, else assume 10:00
 * local. Places are geocoded via Nominatim (cached).
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, parisIso, frMonth, geocodeFrFirst, isOnline } from './fr2-common'

const SRC = 'enercoop-fr'
const BASE = 'https://www.enercoop.fr'
const LIST = `${BASE}/blog/evenements`
const MAX_LIST_PAGES = 3
const MAX_EVENTS = 40
const DEFAULT_HOUR = 10

const REGIONS: Record<string, string> = {
  'auvergne-rhone-alpes': 'Auvergne-Rhône-Alpes', bretagne: 'Bretagne', 'hauts-de-france': 'Hauts-de-France',
  'languedoc-roussillon': 'Occitanie', 'midi-pyrenees': 'Occitanie', paca: "Provence-Alpes-Côte d'Azur",
  'pays-de-la-loire': 'Pays de la Loire', normandie: 'Normandie', 'nouvelle-aquitaine': 'Nouvelle-Aquitaine',
  'nord-est': 'Grand Est', 'bourgogne-franche-comte': 'Bourgogne-Franche-Comté', 'centre-val-de-loire': 'Centre-Val de Loire',
  'ile-de-france': 'Île-de-France',
}

interface Card { url: string; title: string; teaser: string; y: number; m: number; d: number }

function parseCards(html: string): Card[] {
  const $ = load(html)
  const out: Card[] = []
  $('.vc-paginable-document').each((_, el) => {
    const c = $(el)
    const dm = c.find('h2').first().text().trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    const href = c.find('a.vc-link').attr('href') ?? ''
    if (!dm || !href.startsWith('/blog/evenements/')) return
    const txt = (x: string | null) => stripHtml((x ?? '').replace(/<br\s*\/?>/gi, ' '))
    const title = c.find('h3 > span').map((_, s) => txt($(s).html())).get().filter(Boolean).join(' — ')
      || txt(c.find('h3').html())
    out.push({
      url: BASE + href, title: title.replace(/\s+/g, ' '),
      teaser: c.find('p').first().text().replace(/\s+/g, ' ').trim(),
      d: +dm[1], m: +dm[2], y: +dm[3],
    })
  })
  return out
}

/** First plausible start time in free text. */
function findTime(text: string): { h: number; mi: number } | null {
  const pats = [
    /(?:^|[\s(])(?:à|a|dès|des|de|partir de|rendez-vous à)\s+(\d{1,2})\s?h\s?(\d{2})?\b/i,
    /(?:^|[\s>])(\d{1,2})\s?h\s?(\d{2})?\s*[:–-]/,
  ]
  for (const re of pats) {
    const m = text.match(re)
    if (m) {
      const h = +m[1], mi = m[2] ? +m[2] : 0
      if (h >= 7 && h <= 22 && mi < 60) return { h, mi }
    }
  }
  return null
}

/** "du samedi 10 au dimanche 11 octobre 2026" → end day, if a range */
function rangeEnd(text: string, y: number, m: number): { y: number; m: number; d: number } | null {
  const r = text.match(/\bau\s+(?:[a-z]+\s+)?(\d{1,2})(?:er)?\s+([a-zéû]+)(?:\s+(\d{4}))?/i)
  if (!r) return null
  const mo = frMonth(r[2])
  if (!mo) return null
  return { y: r[3] ? +r[3] : (mo < m ? y + 1 : y), m: mo, d: +r[1] }
}

export const enercoopFr: SourceFetcher = {
  name: SRC,
  async fetch() {
    const today = new Date()
    const todayKey = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate()
    const cards: Card[] = []
    for (let p = 1; p <= MAX_LIST_PAGES; p++) {
      const html = await getText(p === 1 ? LIST : `${LIST}/toutes/${p}`)
      if (!html) break
      const cs = parseCards(html)
      const up = cs.filter((c) => c.y * 10000 + c.m * 100 + c.d >= todayKey)
      cards.push(...up)
      if (!cs.length || up.length < cs.length) break // listing reached past events
    }

    const seen = new Set<string>()
    const events: RawEvent[] = []
    for (const c of cards) {
      if (events.length >= MAX_EVENTS) break
      if (seen.has(c.url)) continue
      seen.add(c.url)
      if (isOnline(`${c.title} ${c.teaser}`)) continue

      const html = await getText(c.url)
      if (!html) continue
      const $ = load(html)
      const dateTxt = $('.date-evenement').first().text().replace(/\s+/g, ' ').trim()
      const place = $('.lieu-evenement').first().text().replace(/\s+/g, ' ').trim()
      const body = $('.rich-text').text().replace(/\s+/g, ' ').trim()
      if (isOnline(`${place} ${dateTxt}`)) continue

      const t = findTime(c.teaser) ?? findTime(body)
      const starts = parisIso(c.y, c.m, c.d, t?.h ?? DEFAULT_HOUR, t?.mi ?? 0)
      if (new Date(starts).getTime() < Date.now()) continue
      const re = rangeEnd(dateTxt, c.y, c.m)
      const ends = re ? parisIso(re.y, re.m, re.d, 18, 0) : null

      const regionSlug = c.url.split('/')[5] ?? ''
      const region = REGIONS[regionSlug] ?? ''
      // town hint from title/teaser: "à Creil (60)", "à Volonne"
      const town = `${c.title} ${c.teaser}`.match(/(?:^|\s)à\s+([A-ZÉÈ][\wÀ-ÿ'’-]+(?:[- ](?:sur|sous|en|le|la|les|de|du|d’|d')?[- ]?[A-ZÉÈ]?[\wÀ-ÿ'’-]+)*)(?:\s*\((\d{2,3})\))?/)
      const placeClean = place.replace(/\s*-\s*/g, ', ').replace(/\((\d{2,3})\)/, '$1')
      // A place with a département number / postcode is specific enough on its
      // own; for a bare venue name ("Le toit commun") we use the title's town
      // (venue-name lookups returned homonyms elsewhere in France).
      const placeHasTown = /\(\d{2,3}\)|\b\d{5}\b/.test(place)
      const townQ = town ? `${town[1]}${region ? ', ' + region : ''}` : ''
      const queries = (placeHasTown || !town
        ? [placeClean, town ? `${placeClean}, ${town[1]}` : '', townQ]
        : [townQ, `${placeClean}, ${town[1]}`]
      ).filter((q, i, a) => q && a.indexOf(q) === i)
      const geo = await geocodeFrFirst(queries)
      if (!geo) continue

      const descr = (c.teaser || body).slice(0, 500)
      const image = $('meta[property="og:image"]').attr('content') ?? null
      events.push({
        source: SRC,
        source_id: `enercoop-${c.url.split('/').slice(-2).join('-')}`,
        source_url: c.url,
        title: c.title,
        description: descr,
        organizer: region ? `Enercoop ${region}` : 'Enercoop',
        location_name: (place || town?.[1] || region || 'France').slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: starts,
        ends_at: ends && ends > starts ? ends : null,
        cost: 'See event page',
        image_url: image,
      })
    }
    return events
  },
}
