/**
 * Pusch – Praktischer Umweltschutz — pusch.ch
 * Swiss environmental NGO running courses, field days and conferences for
 * municipalities (biodiversity, hedges, sponge city, climate strategy,
 * sustainable procurement) in German- and French-speaking Switzerland.
 *
 * The site is Next.js + DatoCMS. Every event page is listed in
 * https://www.pusch.ch/sitemap.xml as /event/<slug> (DE) or
 * /fr/evenement/<slug> (FR). Each page's header line reads
 *   "Mittwoch, 11. November 2026 · Tageskurs · Neuendorf"
 *   "Jeudi 12 et vendredi 13 novembre 2026 · Cours de plusieurs jours · Courtepin (FR)"
 * and the programme often has the hours ("08.45–16.30 Uhr", "8h30 – 16h30").
 * Webinars / online events and multi-month certificate courses without a
 * day ("April – November 2027") are skipped. Times are Europe/Zurich; when
 * no time is given 10:00 local is used. Places are geocoded (Nominatim, CH).
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, decodeEntities } from './utils'
import { getText, sleep, monthNum, zurichIso, geocodeCh, ONLINE_RE } from './ch-common'

const SRC = 'pusch-ch'
const ORG = 'Pusch – Praktischer Umweltschutz'
const BASE = 'https://www.pusch.ch'
const MAX_DETAILS = 30

function meta(html: string, prop: string): string {
  const m = html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`, 'i'))
  return m ? decodeEntities(m[1]) : ''
}

/** Visible text of the page (scripts/styles removed). */
function pageText(html: string): string {
  return stripHtml(html.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|li|h\d|section|header)>/gi, ' \n '))
}

export const puschCh: SourceFetcher = {
  name: SRC,
  async fetch() {
    const sm = await getText(`${BASE}/sitemap.xml`, 20000, 'application/xml,text/xml,*/*')
    if (!sm) return []
    const urls = [...new Set(
      [...sm.matchAll(/<loc>(https:\/\/www\.pusch\.ch\/(?:event|fr\/evenement)\/[^<\s]+)<\/loc>/g)].map((m) => m[1]),
    )].slice(0, MAX_DETAILS)

    const now = Date.now()
    const out: RawEvent[] = []
    for (const url of urls) {
      await sleep(400)
      const html = await getText(url)
      if (!html) continue
      const title = stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '') || meta(html, 'og:title').replace(/\s*[|–-]\s*Pusch.*$/, '')
      if (!title) continue
      const text = pageText(html)
      // Header line right after the title: "<date> · <type> · <place>"
      const hm = text.match(/((?:[A-Za-zÀ-ÿ]+,?\s+)?\d{1,2}(?:er)?\.?[^·\n]{0,80}?\b(20\d\d))\s*·\s*([^·\n]{1,60}?)\s*·\s*([^·\n]{1,80}?)(?=\s{1,}[A-ZÀ-ÿ«"'„]|$)/)
      if (!hm) continue
      const dateStr = hm[1]
      const kind = hm[3].trim()
      const place = hm[4].trim()
      if (ONLINE_RE.test(kind) || ONLINE_RE.test(place)) continue

      // Days + month + year: "Mittwoch, 11. November 2026", "Jeudi 12 et vendredi 13 novembre 2026",
      // "Dienstag, 27. Oktober 2026", "17. – 18. März 2027"
      const ym = dateStr.match(/([A-Za-zÀ-ÿ]+)\.?\s+(20\d\d)\s*$/)
      const year = ym ? +ym[2] : NaN
      const mo = ym ? monthNum(ym[1]) : undefined
      if (!mo || !year) continue
      const days = [...dateStr.matchAll(/\b(\d{1,2})(?:er)?\b\.?/g)].map((x) => +x[1]).filter((d) => d >= 1 && d <= 31)
      if (!days.length) continue
      const d1 = days[0]
      const d2 = days[days.length - 1]

      // Hours: "08.45–16.30 Uhr", "13:30–16:45 Uhr", "8h30 – 16h30"
      const tm = text.match(/\b(\d{1,2})[.:h](\d{2})\s*(?:Uhr\s*)?[–-]\s*(\d{1,2})[.:h](\d{2})\s*(?:Uhr|h\b)?/)
      const [h1, m1, h2, m2] = tm ? [+tm[1], +tm[2], +tm[3], +tm[4]] : [10, 0, NaN, NaN]
      const start = zurichIso(year, mo, d1, h1 < 24 ? h1 : 10, m1 < 60 ? m1 : 0)
      if (!start || Date.parse(start) < now) continue
      const end = tm && h2 < 24 ? zurichIso(year, mo, d2, h2, m2) : (d2 !== d1 ? zurichIso(year, mo, d2, 17, 0) : null)

      const town = place.replace(/\s*\((?:[A-Z]{2})\)\s*$/, '').trim()
      const geo = await geocodeCh(town)
      if (!geo) continue

      const costM = text.match(/(?:Nichtmitglied\*?|Non-membres?\*?|Kosten|Coûts?|Prix)\s*:?\s*(CHF\s*[\d'.,–-]+)/i)
      const fr = url.includes('/fr/')
      out.push({
        source: SRC,
        source_id: `pusch-${hashStr(url)}`,
        source_url: url,
        title,
        description: [meta(html, 'description') || meta(html, 'og:description'), `${kind} · ${place}`].filter(Boolean).join(' — ').slice(0, 600),
        organizer: ORG,
        location_name: place,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: start,
        ends_at: end && end > start ? end : null,
        cost: costM ? costM[1].trim() : (fr ? 'Voir le programme' : 'Siehe Programm'),
        image_url: meta(html, 'og:image') || null,
      })
    }
    return out
  },
}
