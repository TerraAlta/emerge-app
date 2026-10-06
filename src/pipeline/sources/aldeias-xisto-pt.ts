/**
 * Aldeias do Xisto — aldeiasdoxisto.com/pt/agenda — 27 schist villages in
 * central Portugal: harvest fairs, chestnut & mushroom festivals, walks.
 *
 * The agenda is server-rendered cards (paged with ?page=N):
 *   <div class="card-item tag-events"><a href="/pt/agenda/<slug>/" class="link" …></a>
 *     <ul class="tags">…<li class="tag">gratuito</li>…</ul> …
 *     <div class="title">XXII Festa da Castanha na Aldeia das Dez</div>
 *     <div class="subtitle">24 out 2026 - 25 out 2026</div>
 *     <div class="location"><svg…/>Aldeia das Dez</div>
 * Each event page adds the description. The site has no machine-readable
 * coordinates, so events sit at the region's centre.
 */
import type { RawEvent, SourceFetcher } from './types'
import { load } from 'cheerio'
import { hashStr } from './utils'

const BASE = 'https://www.aldeiasdoxisto.com'
const SRC = 'aldeias-xisto-pt'
const ORG = 'Aldeias do Xisto'
const LAT = 40.05
const LNG = -8.05
const MAX_PAGES = 4

const PT_MO: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
}

function ptDate(s: string): Date | null {
  const m = s.trim().match(/(\d{1,2})\s+([a-zç]{3})[a-zç]*\.?\s+(\d{4})/i)
  if (!m) return null
  const mo = PT_MO[m[2].toLowerCase()]
  return mo === undefined ? null : new Date(Date.UTC(parseInt(m[3], 10), mo, parseInt(m[1], 10), 10))
}

/** Tags out, HTML entities decoded (the site writes accents as &aacute; etc.). */
const decode = (s: string) => load(`<div>${s}</div>`).text().replace(/\s+/g, ' ').trim()

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(15000),
    })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

/** The event's description paragraphs, from its own page. */
async function description(url: string, title: string): Promise<string> {
  const html = await get(url)
  if (!html) return ''
  const body = html.replace(/<(script|style|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, '')
  return [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((p) => decode(p[1]))
    // skip the menu, map widget and the header block that repeats the title
    .filter((p) => p.length > 60 && !p.includes('[[') && !p.includes(title) && !/^abrir no mapa/i.test(p))
    .slice(0, 3)
    .join(' ')
    .slice(0, 500)
}

export const aldeiasXistoPt: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = Date.now()
    const found = new Map<string, { title: string; start: Date; end: Date | null; place: string; free: boolean }>()

    for (let page = 1; page <= MAX_PAGES; page++) {
      const html = await get(`${BASE}/pt/agenda/${page > 1 ? `?page=${page}` : ''}`)
      if (!html) break
      const before = found.size
      const cardRe = /<div class="card-item tag-events"><a href="(\/pt\/agenda\/[^"?#]+\/)" class="link"[^>]*><\/a>([\s\S]*?)<div class="title">([\s\S]*?)<\/div>\s*<div class="subtitle">([\s\S]*?)<\/div>(?:\s*<div class="location">([\s\S]*?)<\/div>)?/g
      let c
      while ((c = cardRe.exec(html)) !== null) {
        const [, path, tags, rawTitle, rawDates, rawPlace] = c
        const [a, b] = decode(rawDates).split(' - ')
        const start = ptDate(a ?? '')
        if (!start) continue
        const end = b ? ptDate(b) : null
        // Emerge only lists events that haven't started yet
        if (start.getTime() < now) continue
        const place = decode((rawPlace ?? '').replace(/<svg[\s\S]*?<\/svg>|<\?xml[^>]*>|<!--[\s\S]*?-->/g, ''))
        if (!found.has(path)) {
          found.set(path, { title: decode(rawTitle), start, end, place, free: /class="tag">gratuito</.test(tags) })
        }
      }
      if (found.size === before) break // no new events on this page
    }

    const events: RawEvent[] = []
    for (const [path, ev] of found) {
      const url = BASE + path
      const desc = await description(url, ev.title)
      events.push({
        source: SRC,
        source_id: `${SRC}-${hashStr(path + ev.start.toISOString())}`,
        source_url: url,
        title: ev.title,
        description: desc || `${ev.title} — an event in the Aldeias do Xisto, the schist villages of central Portugal.`,
        organizer: ORG,
        location_name: ev.place ? `${ev.place}, Aldeias do Xisto` : 'Aldeias do Xisto, Centro de Portugal',
        lat: LAT,
        lng: LNG,
        starts_at: ev.start.toISOString(),
        ends_at: ev.end ? ev.end.toISOString() : null,
        cost: ev.free ? 'Free' : 'See event page',
      })
    }
    return events
  },
}
