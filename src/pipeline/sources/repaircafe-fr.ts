/**
 * Repair Café France — Repair Café Paris shared calendar
 * (calendrier.repaircafeparis.fr → academie.repaircafeparis.fr/index.php/calendar)
 *
 * repaircafe.org only lists café addresses with free-text opening hours, so
 * we read the dated sessions of the ~30 Paris Repair Cafés instead. The
 * calendar is Joomla + iCagenda: a paginated list of upcoming sessions. Each
 * item link ends with the occurrence's local start ("…/2026-10-07-14-00"),
 * with optional end time and a free-text venue/address. Online sessions
 * (Téléréparation / visioconférence) are skipped. Venues are geocoded via
 * Nominatim (cached), falling back to the arrondissement postcode.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { hashStr } from './utils'
import { getText, parisIso, geocodeFrFirst, isOnline } from './fr2-common'

const SRC = 'repaircafe-fr'
const BASE = 'https://academie.repaircafeparis.fr'
const LIST = `${BASE}/index.php/calendar`
const MAX_PAGES = 6
const MAX_EVENTS = 200

interface Item {
  url: string
  slug: string
  title: string
  category: string
  start: string
  end: string | null
  place: string
  desc: string
}

function parseList(html: string): Item[] {
  const $ = load(html)
  const out: Item[] = []
  $('.ic-list-event').each((_, el) => {
    const ev = $(el)
    const a = ev.find('.ic-event-title h3 a').first()
    const href = a.attr('href') ?? ''
    const m = href.match(/\/calendar\/([^/]+)\/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/)
    const title = a.text().replace(/\s+/g, ' ').trim()
    if (!m || !title) return
    const [y, mo, d, h, mi] = [+m[2], +m[3], +m[4], +m[5], +m[6]]
    const start = parisIso(y, mo, d, h, mi)
    const endTxt = ev.find('.ic-single-endtime').first().text().trim()
    const em = endTxt.match(/^(\d{1,2}):(\d{2})$/)
    const end = em ? parisIso(y, mo, d, +em[1], +em[2]) : null
    out.push({
      url: new URL(href, BASE).toString(),
      slug: `${m[1]}/${m.slice(2, 7).join('-')}`,
      title,
      category: ev.find('.ic-title-cat-btn').first().text().replace(/\s+/g, ' ').trim(),
      start,
      end: end && end > start ? end : null,
      place: ev.find('.ic-place').first().text().replace(/\s+/g, ' ').replace(/\s*-\s*Paris\s*$/i, '').trim(),
      desc: ev.find('.ic-descshort').first().text().replace(/\s+/g, ' ').trim(),
    })
  })
  return out
}

/** Geocoding candidates from a free-text Paris venue string. */
function geoQueries(place: string): string[] {
  const p = place.replace(/,?\s*m[ée]tro\s+[^,-]+/gi, '').replace(/\s+-\s+/g, ', ')
  const qs: string[] = []
  const street = p.match(/(\d+\s*(?:bis|ter)?,?\s+(?:rue|avenue|av\.?|boulevard|bd|place|quai|all[ée]e|passage|impasse|villa|cit[ée]|square|chemin|cour)\b[^,]*?)[\s,]+(75\d{3}|9[1-5]\d{3})\s*([A-Za-zÀ-ÿ' -]*)/i)
  if (street) qs.push(`${street[1].replace(/\bav\.?\b/i, 'avenue').replace(/\bbd\b/i, 'boulevard')}, ${street[2]} ${street[3].trim() || 'Paris'}`)
  qs.push(/paris|\b9[1-5]\d{3}\b/i.test(p) ? p : `${p}, Paris`)
  const cp = p.match(/\b(75\d{3}|9[1-5]\d{3})\b/)
  if (cp) qs.push(`${cp[1]}, ${cp[1].startsWith('75') ? 'Paris' : 'France'}`)
  return qs
}

export const repaircafeFr: SourceFetcher = {
  name: SRC,
  async fetch() {
    const items = new Map<string, Item>()
    for (let p = 1; p <= MAX_PAGES; p++) {
      const html = await getText(p === 1 ? LIST : `${LIST}?page=${p}`)
      if (!html) break
      let added = 0
      for (const it of parseList(html)) if (!items.has(it.slug)) { items.set(it.slug, it); added++ }
      if (!added || !new RegExp(`page=${p + 1}\\b`).test(html)) break
    }

    const events: RawEvent[] = []
    for (const it of items.values()) {
      if (events.length >= MAX_EVENTS) break
      if (new Date(it.start).getTime() < Date.now()) continue
      if (isOnline(`${it.title} ${it.category} ${it.place}`)) continue
      if (!it.place) continue
      const geo = await geocodeFrFirst(geoQueries(it.place))
      if (!geo) continue
      const group = it.category.replace(/^[\d-]+\.\s*/, '')
      events.push({
        source: SRC,
        source_id: `rcparis-${hashStr(it.slug)}`,
        source_url: it.url,
        title: it.title,
        description: (it.desc || `${group} — atelier de réparation collaboratif.`).slice(0, 500),
        organizer: group ? `${group} (Repair Café Paris)` : 'Repair Café Paris',
        location_name: it.place.slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: it.start,
        ends_at: it.end,
        cost: 'Free',
      })
    }
    return events
  },
}
