/**
 * Passerelle Eco — passerelleco.info / ecovillageglobal.fr
 * Eco-village network magazine. Its classifieds site ecovillageglobal.fr has
 * an "Agenda des événements proposés" (spip.php?page=agenda): ads that carry
 * an event date — participatory building sites (chantiers participatifs),
 * stages, discovery stays, gatherings at écolieux.
 *
 * (passerelleco.com is dead; passerelleco.info itself only has articles.)
 *
 * List items carry <time datetime> (UTC midnight of the local start day) plus
 * a French range text ("Du 14 au 18 octobre", "Du 28 octobre au 1er novembre")
 * which we parse for the end day. The agenda also lists long-running offers
 * and housing searches; we keep only items starting in the future and lasting
 * ≤ 31 days, and drop "recherche/cherche" ads and housing/carpool rubrics.
 * No times are given: we assume 09:00–18:00 local.
 * Coordinates come from the site's own GIS JSON for each ad (one request per
 * kept item); fallback is the ad's département via Nominatim.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { getText, parisIso, frMonth, geocodeFr, inFrance, isOnline } from './fr2-common'

const SRC = 'passerelleco-fr'
const BASE = 'https://ecovillageglobal.fr'
const LIST = `${BASE}/spip.php?page=agenda`
const MAX_PAGES = 10
const MAX_EVENTS = 200
const MAX_DAYS = 31

interface Item {
  id: string
  title: string
  startDay: { y: number; m: number; d: number }
  endDay: { y: number; m: number; d: number }
  rubrique: string
  dept: string
  author: string
  intro: string
}

/** UTC instant → Paris calendar day */
function parisDay(iso: string): { y: number; m: number; d: number } | null {
  const t = new Date(iso)
  if (isNaN(t.getTime())) return null
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(t).map((x) => [x.type, x.value]),
  )
  return { y: +p.year, m: +p.month, d: +p.day }
}

/** "Du 14 au 18 octobre" / "Du 28 octobre au 1er novembre" / "Du 1er sept au 30 juin 2027" → end day */
function endDay(text: string, start: { y: number; m: number; d: number }): { y: number; m: number; d: number } {
  const m = text.match(/\bau\s+(\d{1,2})(?:er)?(?:\s+([a-zéèûô]+))?(?:\s+(\d{4}))?/i)
  if (!m) return start
  const d = parseInt(m[1], 10)
  const mo = m[2] ? frMonth(m[2]) ?? start.m : start.m
  let y = m[3] ? parseInt(m[3], 10) : start.y
  if (!m[3] && Date.UTC(y, mo - 1, d) < Date.UTC(start.y, start.m - 1, start.d)) y++
  return { y, m: mo, d }
}

function parseList(html: string): { items: Item[]; hasNext: boolean } {
  const $ = load(html)
  const items: Item[] = []
  $('article.entry.annonce').each((_, el) => {
    const a = $(el)
    const href = a.find('a.resume').attr('href') ?? ''
    const idm = href.match(/^\/(\d+)$/)
    const title = a.find('h3').first().text().replace(/\s+/g, ' ').trim()
    const time = a.find('.date_evenement time')
    const dt = time.attr('datetime')
    if (!idm || !title || !dt) return
    const startDay = parisDay(dt)
    if (!startDay || startDay.y < 2000) return // "Jusqu'au …" ads have a 1999 placeholder
    const rangeText = time.text().replace(/\s+/g, ' ').trim()
    items.push({
      id: idm[1],
      title,
      startDay,
      endDay: endDay(rangeText, startDay),
      rubrique: a.find('li.rubrique').attr('title') ?? '',
      dept: a.find('li.lieu a').first().text().replace(/\s+/g, ' ').trim(),
      author: a.find('li.auteur').text().replace(/\s+/g, ' ').trim(),
      intro: a.find('.introduction').text().replace(/\s+/g, ' ').replace(/\(…\)\s*$/, '…').trim(),
    })
  })
  return { items, hasNext: /debut_annonces=\d+/.test(html) }
}

async function adCoords(id: string): Promise<{ lat: number; lng: number } | null> {
  const txt = await getText(`${BASE}/spip.php?page=gis_json&objets=annonce&limit=1&id_annonce=${id}`)
  if (!txt) return null
  try {
    const c = JSON.parse(txt)?.features?.[0]?.geometry?.coordinates
    if (Array.isArray(c) && inFrance(+c[1], +c[0])) return { lat: +c[1], lng: +c[0] }
  } catch { /* fall through */ }
  return null
}

export const passerellecoFr: SourceFetcher = {
  name: SRC,
  async fetch() {
    const byId = new Map<string, Item>()
    for (let p = 0; p < MAX_PAGES; p++) {
      const html = await getText(p === 0 ? LIST : `${LIST}&debut_annonces=${p * 5}`)
      if (!html) break
      const { items } = parseList(html)
      if (!items.length) break
      let added = 0
      for (const it of items) if (!byId.has(it.id)) { byId.set(it.id, it); added++ }
      if (!added) break
    }

    const events: RawEvent[] = []
    for (const it of byId.values()) {
      if (events.length >= MAX_EVENTS) break
      const { startDay: s, endDay: e } = it
      const starts = parisIso(s.y, s.m, s.d, 9, 0)
      if (new Date(starts).getTime() < Date.now()) continue
      const days = (Date.UTC(e.y, e.m - 1, e.d) - Date.UTC(s.y, s.m - 1, s.d)) / 86400000
      if (days < 0 || days > MAX_DAYS) continue
      if (/(^|\s)(re)?ch?erche|^rechet|^lieu de vie|^projet/i.test(it.title)) continue
      if (/location|covoiturage|voitures/i.test(it.rubrique)) continue
      if (isOnline(`${it.title} ${it.intro}`)) continue

      const geo = (await adCoords(it.id)) ?? (it.dept ? await geocodeFr(`${it.dept}, France`) : null)
      if (!geo) continue

      events.push({
        source: SRC,
        source_id: `passerelleco-${it.id}`,
        source_url: `${BASE}/${it.id}`,
        title: it.title,
        description: (it.intro || it.title).slice(0, 500),
        organizer: it.author.replace(/^\((.*)\)$/, '$1') || 'Passerelle Eco / Écovillage Global',
        location_name: it.dept ? `${it.dept}, France` : 'France',
        lat: geo.lat,
        lng: geo.lng,
        starts_at: starts,
        ends_at: parisIso(e.y, e.m, e.d, 18, 0),
        cost: 'See event page',
      })
    }
    return events
  },
}
