/**
 * Plantar uma Árvore — plantarumaarvore.org — volunteer nature-restoration
 * days (Sintra-Cascais, Bussaco, Barreiro…), roughly two a month.
 *
 * The /iniciativas/ listing is server-rendered: each card has
 * `<div class="date">31 Out 2026 | 09:30</div><div class="title">…</div>`.
 * (The RSS pubDate is the post date, not the event date.) Added 2026-10-07.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'plantar-uma-arvore-pt'
const LIST = 'https://plantarumaarvore.org/iniciativas/'
const MONTHS: Record<string, number> = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 }

// Where their recurring sites are; anything else is geocoded from the title.
const PLACES: [RegExp, string, number, number][] = [
  [/bussaco|buçaco/i, 'Mata Nacional do Bussaco, Portugal', 40.3769, -8.3653],
  [/monge|sintra|cascais/i, 'Parque Natural de Sintra-Cascais, Portugal', 38.7694, -9.4411],
  [/barreiro/i, 'Barreiro, Portugal', 38.6631, -9.0724],
]

/** A wall-clock time in Lisbon → the real instant (handles summer/winter time). */
function lisbonTime(y: number, month: number, d: number, hh: number, mm: number): Date {
  const asUtc = Date.UTC(y, month, d, hh, mm)
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Lisbon', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(asUtc)).find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = tz.match(/GMT([+-]\d+)?/)
  const offsetH = m?.[1] ? Number(m[1]) : 0
  return new Date(asUtc - offsetH * 3600_000)
}

export const plantarUmaArvorePt: SourceFetcher = {
  name: SRC,
  async fetch() {
    let html: string
    try {
      const res = await fetch(LIST, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)' }, signal: AbortSignal.timeout(20_000) })
      if (!res.ok) return []
      html = await res.text()
    } catch {
      return []
    }

    const now = Date.now()
    const events: RawEvent[] = []
    const card = /<a href="(https:\/\/plantarumaarvore\.org\/iniciativas\/[^"]+)">\s*<div\s+class="date">\s*(\d{1,2})\s+(\w{3})\w*\s+(\d{4})\s*(?:\|\s*(\d{1,2}):(\d{2}))?\s*<\/div>\s*<div\s+class="title">([\s\S]*?)<\/div>/g
    for (const m of html.matchAll(card)) {
      const [, url, d, mon, y, hh, mm, rawTitle] = m
      const month = MONTHS[mon.toLowerCase()]
      if (month === undefined) continue
      const start = lisbonTime(Number(y), month, Number(d), Number(hh ?? 9), Number(mm ?? 0))
      if (isNaN(start.getTime()) || start.getTime() < now) continue
      const title = stripHtml(rawTitle).replace(/\s+/g, ' ').trim()
      const place = PLACES.find(([re]) => re.test(title))
      events.push({
        source: SRC,
        source_id: `${SRC}-${hashStr(url)}`,
        source_url: url,
        title: `Voluntariado: ${title}`,
        description: `Dia de voluntariado de restauro ecológico com a Plantar uma Árvore — ${title}.`,
        organizer: 'Plantar uma Árvore',
        location_name: place?.[1] ?? `${title}, Portugal`,
        lat: place?.[2] ?? 0,
        lng: place?.[3] ?? 0,
        starts_at: start.toISOString(),
        ends_at: null,
        cost: 'Free',
        image_url: null,
      })
    }
    return events
  },
}
