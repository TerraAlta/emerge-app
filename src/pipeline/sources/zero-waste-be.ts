/**
 * Zero Waste Belgium — zerowastebelgium.org
 * Brussels/Wallonia zero-waste NGO: workshops (conservation, cloth nappies,
 * cold-process soap, "Fresque de l'économie circulaire"), stands, donneries.
 *
 * WordPress with a custom `event` post type that is NOT exposed on the REST
 * API; the /agenda/ page is filtered client-side. The Yoast sitemap
 * /event-sitemap.xml lists every event page with <lastmod>, so we read only
 * the event pages touched in the last year (newest first, ≤ 20 requests).
 * Each page shows "<Type> DD/MM/YY <Title>" (the event date) and free text
 * with the hours ("de 15h00 à 17h00") and place ("Où ? …" / "Lieu …" /
 * "Atelier X – Uccle"). Place is geocoded (cached); events without a usable
 * place are skipped. Hours unknown → 10:00 local.
 *
 * The organisation posts events irregularly; between campaigns the source
 * legitimately returns nothing. (The old zerowastebelgium.be domain does
 * not resolve.)
 */
import * as cheerio from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { decodeEntities } from './utils'
import { getText, parisIso, geocodeFrFirst, ONLINE_RE } from './fr-common'

const SRC = 'zero-waste-be'
const BASE = 'https://www.zerowastebelgium.org'
const SITEMAP = `${BASE}/event-sitemap.xml`
const MAX_PAGES = 20
const RECENT_DAYS = 365

export const zeroWasteBe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const xml = await getText(SITEMAP)
    if (!xml) return []
    const now = Date.now()
    const entries = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)]
      .map((m) => ({ url: m[1].trim(), mod: Date.parse(m[2] ?? '') }))
      .filter((e) => /\/event\/[^/]+\/?$/.test(e.url) && e.mod > now - RECENT_DAYS * 86400000)
      .sort((a, b) => b.mod - a.mod)
      .slice(0, MAX_PAGES)

    const events: RawEvent[] = []
    for (const { url } of entries) {
      const html = await getText(url)
      if (!html) continue
      const $ = cheerio.load(html)
      const h1 = $('h1').first()
      const title = decodeEntities(h1.text()).replace(/\s+/g, ' ').trim()
      if (!title) continue
      // The event header block: "Ateliers 15/11/25 Atelier Conservation – Uccle"
      let dm: RegExpMatchArray | null = null
      for (let el = h1.parent(); el.length && !dm; el = el.parent()) {
        if (el.is('body')) break
        dm = el.text().replace(/\s+/g, ' ').match(/(\d{2})\/(\d{2})\/(\d{2})\b/)
      }
      if (!dm) continue
      $('script, style, header, footer, nav, form').remove()
      const text = decodeEntities($('main').text() || $('body').text()).replace(/\s+/g, ' ').trim()
      const at = text.indexOf(title)
      const body = at >= 0 ? text.slice(at + title.length) : text
      const bodyEnd = body.search(/Partager sur|Nos prochains événements/)
      const desc = (bodyEnd > 0 ? body.slice(0, bodyEnd) : body).trim()

      const hm = desc.match(/\b(\d{1,2})\s*h\s*(\d{2})?\s*(?:à|-|–)\s*(\d{1,2})\s*h\s*(\d{2})?/i)
        ?? desc.match(/\b(\d{1,2}):(\d{2})\s*(?:à|-|–)\s*(\d{1,2}):(\d{2})/)
      // Start-only phrasing: "Ouverture des portes à 17:50", "dès 14h"
      const one = hm ? null : desc.match(/(?:^|\s)(?:à|dès)\s+(\d{1,2})\s*[h:]\s*(\d{2})?/i)
      const y = 2000 + +dm[3]
      const mo = +dm[2]
      const d = +dm[1]
      const sh = hm ? +hm[1] : one && +one[1] < 24 ? +one[1] : 10
      const smi = hm ? +(hm[2] ?? 0) : one && +one[1] < 24 ? +(one[2] ?? 0) : 0
      const start = parisIso(y, mo, d, sh, smi)
      if (!start || Date.parse(start) < now) continue
      let end = hm ? parisIso(y, mo, d, +hm[3], +(hm[4] ?? 0)) : null
      if (end && end <= start) end = null

      const where = desc.match(/Où\s*\?\s*(.{3,120}?)(?:\.\s|\s+Coût|\s+Quand|$)/i)?.[1]
        ?? desc.match(/\bLieu\s+(.{3,120}?)$/)?.[1]
        ?? ''
      const town = title.match(/\s[–-]\s([^–-]{2,40})$/)?.[1]?.replace(/^.*\sà\s+/i, '').trim() ?? ''
      if (ONLINE_RE.test(`${title} ${where}`)) continue
      const cleanWhere = where.replace(/[()]/g, ' ').replace(/^\s*(?:A|À)\s+(?:la|le|l')?\s*/i, '').replace(/\s+/g, ' ').trim()
      const geo = await geocodeFrFirst([
        cleanWhere && town ? `${cleanWhere}, ${town}, Belgique` : '',
        cleanWhere ? `${cleanWhere}, Belgique` : '',
        town ? `${town}, Belgique` : '',
      ].filter(Boolean))
      if (!geo) continue

      const cost = desc.match(/Coût\s*\?\s*([^.]{1,40})/i)?.[1]?.trim()
      events.push({
        source: SRC,
        source_id: `zwb-${url.replace(/\/$/, '').split('/').pop()}`,
        source_url: url,
        title,
        description: desc.slice(0, 600) || 'Activité Zero Waste Belgium.',
        organizer: 'Zero Waste Belgium',
        location_name: [cleanWhere, town].filter(Boolean).join(', ') || 'Belgique',
        lat: geo.lat, lng: geo.lng,
        starts_at: start,
        ends_at: end,
        cost: cost ? (/gratuit/i.test(cost) ? 'Gratuit' : cost) : 'Voir site',
        image_url: $('meta[property="og:image"]').attr('content') ?? null,
      })
    }
    return events
  },
}
