/**
 * Biovision — Stiftung für ökologische Entwicklung — biovision.ch
 * Swiss foundation for agroecology / sustainable food systems. Public events:
 * the yearly Biovision-Symposium (Volkshaus Zürich), talks, conferences,
 * CLEVER escape games, soil days.
 *
 * https://www.biovision.ch/veranstaltungen/ is an Elementor page (no event
 * post type / API). Each event is a block of widgets in a fixed order:
 *   heading "Title" → text "21. Oktober 2026 <br> 11.00 – 12.00 Uhr"
 *   → text "Venue <br> Street <br> 2502 Biel" → text description.
 * The widgets are read in document order and an event is taken whenever a
 * heading is followed by a full date with a year. Past events either lack
 * the year or are filtered by date; online events (Teams/Zoom/"Online") are
 * skipped. Times are Europe/Zurich (10:00 if none). Venues are geocoded.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, monthNum, zurichIso, geocodeChFirst, ONLINE_RE } from './ch-common'

const SRC = 'biovision-ch'
const ORG = 'Biovision – Stiftung für ökologische Entwicklung'
const URL_DE = 'https://www.biovision.ch/veranstaltungen/'

type W = { kind: 'h' | 't'; text: string; html: string }

function widgets(html: string): W[] {
  const out: W[] = []
  const re = /<div class="elementor-heading-title[^"]*">([\s\S]*?)<\/div>|<h[1-6] class="elementor-heading-title[^"]*">([\s\S]*?)<\/h[1-6]>|data-widget_type="text-editor\.default">\s*<div class="elementor-widget-container">([\s\S]*?)<\/div>\s*<\/div>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[1] !== undefined || m[2] !== undefined) {
      const h = m[1] ?? m[2]
      out.push({ kind: 'h', text: stripHtml(h), html: h })
    } else {
      // keep line breaks as " | " (stripHtml collapses whitespace)
      out.push({ kind: 't', text: stripHtml(m[3].replace(/<br\s*\/?>/gi, ' | ').replace(/<\/p>/gi, ' | ')).replace(/^\s*\|\s*|\s*\|\s*$/g, ''), html: m[3] })
    }
  }
  return out
}

const DATE_RE = /^\s*(\d{1,2})\.\s*([A-Za-zäöüÄÖÜéû]+)\s+(20\d\d)\b/

export const biovisionCh: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(URL_DE)
    if (!html) return []
    const ws = widgets(html)
    const now = Date.now()
    const out: RawEvent[] = []
    const seen = new Set<string>()
    for (let i = 0; i < ws.length - 1; i++) {
      if (ws[i].kind !== 'h') continue
      const title = ws[i].text
      const dw = ws[i + 1]
      const dm = dw.kind === 't' ? dw.text.match(DATE_RE) : null
      if (!title || !dm) continue
      const mo = monthNum(dm[2])
      if (!mo) continue
      const tm = dw.text.match(/(\d{1,2})[.:](\d{2})\s*[–-]\s*(\d{1,2})[.:](\d{2})/) ?? dw.text.match(/(\d{1,2})[.:](\d{2})\s*Uhr/)
      const y = +dm[3], d = +dm[1]
      const start = zurichIso(y, mo, d, tm ? +tm[1] : 10, tm ? +tm[2] : 0)
      if (!start || Date.parse(start) < now) continue
      const end = tm && tm[3] ? zurichIso(y, mo, d, +tm[3], +tm[4]) : null

      const lw = ws[i + 2]
      const place = lw && lw.kind === 't' && !DATE_RE.test(lw.text) ? lw.text.split('|').map((x) => x.trim()).filter(Boolean).join(', ') : ''
      if (!place || ONLINE_RE.test(place) || ONLINE_RE.test(title)) continue
      const key = `${title}|${start}`
      if (seen.has(key)) continue // desktop + mobile copies
      seen.add(key)

      // Venue lines up to the one with the postcode ("2502 Biel"); without a
      // postcode only the first line (the rest is e.g. language / admission)
      const all = place.split(',').map((s) => s.trim()).filter(Boolean)
      const pcIdx = all.findIndex((l) => /\b\d{4}\s+[A-ZÄÖÜÉ]/.test(l))
      const lines = pcIdx >= 0 ? all.slice(0, pcIdx + 1) : all.slice(0, 1)
      const venue = lines.join(', ')
      const pc = venue.match(/\b(\d{4})\s+([A-ZÄÖÜÉ][\wäöüéè.-]+)/)
      const geo = await geocodeChFirst([venue, pc ? `${pc[1]} ${pc[2]}` : '', lines[0] ?? ''].filter(Boolean))
      if (!geo) continue

      const descW = ws[i + 3]
      const desc = descW && descW.kind === 't' && descW.text.length > 40 ? descW.text : ''
      const link = (descW?.html ?? '').match(/href="(https?:\/\/[^"]+)"/)?.[1]
      out.push({
        source: SRC,
        source_id: `bv-ch-${hashStr(key)}`,
        source_url: URL_DE,
        title,
        description: [desc.replace(/\s+/g, ' ').slice(0, 600), link ? `Programm/Anmeldung: ${link}` : ''].filter(Boolean).join(' '),
        organizer: ORG,
        location_name: venue,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: start,
        ends_at: end && end > start ? end : null,
        cost: /eintritt frei|kostenlos|gratis|entrée libre/i.test(`${place} ${desc}`) ? 'Free' : 'Siehe Veranstaltung',
        image_url: null,
      })
    }
    return out
  },
}
