/**
 * Lipor — lipor.pt — Porto metro waste/compost authority. Its agenda is
 * mostly community garage sales (reuse) plus occasional workshops.
 * Cards: `<span class="title">07 Out</span><span class="txt green">Title</span>
 * <span class="txt">Address</span>` — no year, so we take the next
 * occurrence of that day/month. Added 2026-10-07.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities, hashStr } from './utils'

const SRC = 'lipor-pt'
const PAGE = 'https://www.lipor.pt/pt/agenda/'
const MONTHS: Record<string, number> = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 }

export const liporPt: SourceFetcher = {
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
    const now = new Date()
    const events: RawEvent[] = []
    const card = /<a href="(\/pt\/agenda\/[^"]+)"[^>]*class="[^"]*booking-item[^"]*"[^>]*>\s*<span class="title">(\d{1,2})\s+(\w{3})\w*<\/span>\s*<span class="txt green">([\s\S]*?)<\/span>\s*<span class="txt">([\s\S]*?)<\/span>/g
    for (const m of html.matchAll(card)) {
      const [, path, d, mon, rawTitle, rawPlace] = m
      const month = MONTHS[mon.toLowerCase()]
      if (month === undefined) continue
      let start = new Date(Date.UTC(now.getUTCFullYear(), month, Number(d), 9, 0))
      if (start.getTime() < now.getTime() - 86400_000) start = new Date(Date.UTC(now.getUTCFullYear() + 1, month, Number(d), 9, 0))
      if (start.getTime() < now.getTime()) continue
      const title = decodeEntities(stripHtml(rawTitle)).trim()
      const place = decodeEntities(stripHtml(rawPlace)).trim()
      const url = 'https://www.lipor.pt' + path
      events.push({
        source: SRC,
        source_id: `${SRC}-${hashStr(url)}`,
        source_url: url,
        title,
        description: /garagem/i.test(title)
          ? `${title} — venda de garagem comunitária da Lipor: dar nova vida a objetos usados (reutilização, economia circular).`
          : `${title} — Lipor.`,
        organizer: 'Lipor',
        location_name: place ? `${place}, Portugal` : 'Lipor, Ermesinde, Portugal',
        lat: 0,
        lng: 0,
        starts_at: start.toISOString(),
        ends_at: null,
        cost: 'Free',
        image_url: null,
      })
    }
    return events
  },
}
