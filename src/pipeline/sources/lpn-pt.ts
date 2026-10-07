/**
 * LPN — Liga para a Protecção da Natureza — lpn.pt — nature walks,
 * workshops and reserve visits (Lisbon, Alentejo steppe, coastal lagoons).
 *
 * The agenda page embeds its calendar as a JS array
 * (`events: [{ title, start, urlevent }, …]`); each event page has a
 * "Local <place> Horário" line. Served as ISO-8859-1 — decoded as latin1 or
 * the accents are lost. Added 2026-10-07.
 */
import type { RawEvent, SourceFetcher } from './types'
import { hashStr } from './utils'

const SRC = 'lpn-pt'
const PAGE = 'https://www.lpn.pt/pt/agenda'
const MAX_DETAIL = 15

async function getLatin1(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)' }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null
    return new TextDecoder('latin1').decode(await res.arrayBuffer())
  } catch {
    return null
  }
}

const unquote = (s: string) => s.replace(/\\'/g, "'").trim()

export const lpnPt: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getLatin1(PAGE)
    if (!html) return []
    const today = new Date().toISOString().slice(0, 10)
    const items: { title: string; start: string; end: string; url: string }[] = []
    const re = /\{\s*title:\s*'((?:[^'\\]|\\.)*)',\s*start:\s*'(\d{4}-\d{2}-\d{2})',\s*end:\s*'(\d{4}-\d{2}-\d{2})'[\s\S]*?urlevent:\s*'([^']+)'/g
    for (const m of html.matchAll(re)) {
      if (m[2] >= today) items.push({ title: unquote(m[1]), start: m[2], end: m[3], url: m[4] })
    }

    const events: RawEvent[] = []
    for (const it of items.slice(0, MAX_DETAIL)) {
      const detail = await getLatin1(it.url)
      const text = detail ? detail.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : ''
      const place = text.match(/\bLocal\s+(.{3,120}?)\s+Horário/)?.[1]?.trim()
        // Some pages leave "Local" empty; known LPN sites can be read off the title.
        ?? (/monsanto/i.test(it.title) ? 'Parque Florestal de Monsanto, Lisboa' : undefined)
      if (/online|webinar/i.test(it.title + ' ' + (place ?? ''))) continue
      events.push({
        source: SRC,
        source_id: `${SRC}-${hashStr(it.url + it.start)}`,
        source_url: it.url,
        title: it.title,
        description: `${it.title} — LPN, Liga para a Protecção da Natureza.${place ? ' Local: ' + place + '.' : ''}`,
        organizer: 'LPN — Liga para a Protecção da Natureza',
        // Geocoded by the orchestrator; without a place it would land nowhere.
        location_name: place ? `${place}, Portugal` : 'See event page',
        lat: 0,
        lng: 0,
        starts_at: new Date(`${it.start}T10:00:00Z`).toISOString(),
        ends_at: it.end && it.end !== it.start ? new Date(`${it.end}T17:00:00Z`).toISOString() : null,
        cost: 'See event page',
        image_url: null,
      })
    }
    return events
  },
}
