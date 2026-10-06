/**
 * Bio Suisse — organic farming events in Switzerland.
 *
 * Bio Suisse's own site (bio-suisse.ch; the old www.biosuisse.ch no longer
 * answers) has no dated event list of its own: its "Tagungen und Kurse" link
 * points to the agenda of bioaktuell.ch, the organic-farming practice portal
 * run by Bio Suisse and FiBL. That agenda lists courses, field walks
 * (Flurgänge), conversion courses, conferences and markets from Bio Suisse,
 * FiBL, cantonal agricultural schools, ProSpecieRara, Bioterra, etc.
 *
 * https://www.bioaktuell.ch/aktuell/agenda (TYPO3 news, 30 per page,
 * paginated with signed ?…currentPage=N&cHash=… links) renders each entry as
 *   <time class="appointment__date" datetime="2026-10-12">,
 *   <a href="/aktuell/agenda/termin/…"><h3>Title</h3></a>,
 *   <p class="appointment__location">Organiser; Place</p>.
 * Pages are very heavy (~7 MB of navigation JSON each), so detail pages are
 * NOT fetched: only the date is known and 10:00 Europe/Zurich is used.
 * Online events, "Ort noch offen" and events abroad are skipped. Places are
 * geocoded with Nominatim (CH/LI), cached per place.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, sleep, zurichIso, geocodeChFirst, ONLINE_RE } from './ch-common'

const SRC = 'biosuisse-ch'
const BASE = 'https://www.bioaktuell.ch'
const LIST = `${BASE}/aktuell/agenda`
const MAX_PAGES = 4
const ABROAD_RE = /\b(Deutschland|Österreich|Oesterreich|Frankreich|France|Italien|Italia|Allemagne|Autriche)\b/i

interface Item { date: string; href: string; title: string; org: string; place: string }

function parseList(html: string): Item[] {
  const out: Item[] = []
  const re = /<time class="appointment__date" datetime="(\d{4}-\d{2}-\d{2})">[\s\S]*?href="([^"]+)"[\s\S]*?<h3>([\s\S]*?)<\/h3>[\s\S]*?class="appointment__location">([\s\S]*?)<\/p>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const loc = stripHtml(m[4])
    const parts = loc.split(';').map((s) => s.trim()).filter(Boolean)
    const place = parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? '')
    const org = parts.length > 1 ? parts.slice(0, -1).join('; ') : ''
    out.push({ date: m[1], href: m[2], title: stripHtml(m[3]), org, place })
  }
  return out
}

/** Geocoding candidates for places like "8268 Salenstein TG", "Erlinsbach SO", "LZSG Rheinhof, 9465 Salez SG, Hörsaal". */
function placeQueries(place: string): string[] {
  const q: string[] = []
  const pc = place.match(/\b(\d{4})\s+([A-ZÄÖÜ][\wäöüéèà.'-]+(?:[ -][A-ZÄÖÜ][\wäöüéèà.'-]+)?)/)
  if (pc) q.push(`${pc[1]} ${pc[2].replace(/\s+[A-Z]{2}$/, '')}`)
  const first = place.split(/[,&]|\bund\b/)[0].trim()
  const town = first.replace(/^\d{4}\s+/, '').replace(/\s+[A-Z]{2}$/, '').trim()
  const canton = first.match(/\s([A-Z]{2})$/)?.[1] ?? place.match(/\s([A-Z]{2})\b/)?.[1]
  if (town && canton) q.push(`${town}, ${canton}`)
  if (town) q.push(town)
  return q
}

export const biosuisseCh: SourceFetcher = {
  name: SRC,
  async fetch() {
    const items: Item[] = []
    const seenPages = new Set<string>([LIST])
    let next: string | null = LIST
    for (let p = 0; p < MAX_PAGES && next; p++) {
      if (p > 0) await sleep(1000)
      const html = await getText(next, 30000)
      if (!html) break
      items.push(...parseList(html))
      // Follow the signed pagination link to the next page number
      const cur = p + 1
      const links = [...html.matchAll(/href="(\/aktuell\/agenda\?[^"]*currentPage%5D=(\d+)[^"]*)"/g)]
      const nl = links.find((l) => +l[2] === cur + 1)
      next = nl ? BASE + nl[1].replace(/&amp;/g, '&') : null
      if (next && seenPages.has(next)) next = null
      if (next) seenPages.add(next)
    }

    const now = Date.now()
    const out: RawEvent[] = []
    const seen = new Set<string>()
    for (const it of items) {
      if (seen.has(it.href)) continue
      seen.add(it.href)
      if (!it.title || !it.place) continue
      if (ONLINE_RE.test(it.place) || ONLINE_RE.test(it.title)) continue
      if (/noch offen|^schweiz$|^suisse$|wird bekannt/i.test(it.place) || ABROAD_RE.test(it.place)) continue
      const [y, mo, d] = it.date.split('-').map(Number)
      const start = zurichIso(y, mo, d, 10, 0)
      if (!start || Date.parse(start) < now) continue
      const geo = await geocodeChFirst(placeQueries(it.place))
      if (!geo) continue
      const url = it.href.startsWith('http') ? it.href : BASE + it.href
      out.push({
        source: SRC,
        source_id: `bio-ch-${hashStr(url)}`,
        source_url: url,
        title: it.title,
        description: `${it.title}${it.org ? ` — Veranstalter: ${it.org}` : ''}. Ort: ${it.place}. Aus der Bio-Agenda von bioaktuell.ch (Bio Suisse / FiBL).`,
        organizer: it.org || 'Bio Suisse / FiBL',
        location_name: it.place,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: start,
        ends_at: null,
        cost: 'Siehe Veranstaltung',
        image_url: null,
      })
      if (out.length >= 200) break
    }
    return out
  },
}
