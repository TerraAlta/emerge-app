/**
 * SPEA — Sociedade Portuguesa para o Estudo das Aves — spea.pt — birding
 * walks, nature outings, courses. Server-rendered cards: start day +
 * "Mês <br>Ano", an <h4> title, an excerpt "Place | dates", and detail tags
 * (activity type, region). Online/webinar events are skipped. Added 2026-10-07.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities, hashStr } from './utils'

const SRC = 'spea-pt'
const PAGE = 'https://spea.pt/agenda/'
const MONTHS: Record<string, number> = {
  janeiro: 0, fevereiro: 1, 'março': 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
}

export const speaPt: SourceFetcher = {
  name: SRC,
  async fetch() {
    let html: string
    try {
      const res = await fetch(PAGE, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)' }, signal: AbortSignal.timeout(30_000) })
      if (!res.ok) return []
      html = await res.text()
    } catch {
      return []
    }
    const now = Date.now()
    const events: RawEvent[] = []
    const cards = html.split('<div class="list-item card').slice(1)
    for (const card of cards) {
      const url = card.match(/href="(https:\/\/spea\.pt\/agenda\/evento\/[^"]+)"/)?.[1]
      const day = card.match(/<span class="day">(\d{1,2})<\/span>/)?.[1]
      const my = card.match(/<span class="month-year">\s*([A-Za-zçÇ]+)\s*<br>\s*(\d{4})/)
      const title = card.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)?.[1]
      if (!url || !day || !my || !title) continue
      const month = MONTHS[my[1].toLowerCase()]
      if (month === undefined) continue
      const start = new Date(Date.UTC(Number(my[2]), month, Number(day), 9, 0))
      if (start.getTime() < now) continue
      const cleanTitle = decodeEntities(stripHtml(title)).trim()
      const details = [...card.matchAll(/<p class="small">[\s\S]*?<span>\s*([\s\S]*?)\s*<\/span>\s*<\/p>/g)].map(d => stripHtml(d[1]).trim())
      if (/online|webinar|à distância|cancelad/i.test(cleanTitle + ' ' + details.join(' '))) continue
      // The excerpt is "Alenquer | 8 set-9 out" on some cards and just dates on
      // others; a "| Town" suffix on the title is next best; then the region tag.
      const excerpt = stripHtml(card.match(/<span class="small excerpt">([\s\S]*?)<\/span>/)?.[1] ?? '')
      const exTown = excerpt.includes('|') ? excerpt.split('|')[0].trim() : ''
      const titleTown = cleanTitle.includes('|') ? cleanTitle.split('|').pop()!.trim() : ''
      // Card tags are [activity type, region, audiences…].
      const region = details[1] ?? ''
      const town = [exTown, titleTown, region].find(t => t && !/\d|datas?\b/i.test(t)) ?? ''
      events.push({
        source: SRC,
        source_id: `${SRC}-${hashStr(url + start.toISOString())}`,
        source_url: url,
        title: cleanTitle,
        description: `${cleanTitle} — SPEA. ${details.join(' · ')}`.slice(0, 500),
        organizer: 'SPEA — Sociedade Portuguesa para o Estudo das Aves',
        location_name: town ? `${town}, Portugal` : 'See event page',
        lat: 0,
        lng: 0,
        starts_at: start.toISOString(),
        ends_at: null,
        cost: 'See event page',
        image_url: null,
      })
    }
    return events
  },
}
