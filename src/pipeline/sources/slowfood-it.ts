/**
 * Slow Food Italia — slowfood.it
 * Local events of the Condotte and Slow Food Communities across Italy
 * (masterclasses, taste workshops, Mercati della Terra days, convivial
 * dinners). Separate from slowfood-global.ts (international events).
 *
 * slowfood.it has no event post type or calendar API; the events are
 * collected by Slow Food Italia every week into a "Slow Week" article
 * (category id 2123), structured as <h3>Region</h3> <h4>Town (Prov)</h4>
 * followed by paragraphs that start with the date ("Domenica 4 ottobre a
 * partire dalle ore 10 …"). We read the latest 4 Slow Week posts through the
 * WP REST API (1 request) and turn each town section into one event: date
 * and time from the text (Italian month names; "Mercoledì 21" without month
 * is resolved to the next matching weekday), venue geocoded from the town.
 * The recurring "Mercati della Terra" list at the bottom is a directory and
 * is ignored. Sections with no parseable date are skipped. When no time is
 * given we assume 10:00 Europe/Rome.
 *
 * Added: the Condotta Romagna Valle del Lamone runs The Events Calendar, so
 * its tribe REST feed is read directly (exact times + venue); their entries
 * in the Slow Week posts are then skipped to avoid duplicates.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, romeIso, geocodeFirst, IT_MONTHS } from './italy-common'

const SRC = 'slowfood-it'
const WP = 'https://www.slowfood.it/wp-json/wp/v2/posts'
const SLOW_WEEK_CAT = 2123
const LAMONE = 'https://www.slowfoodromagnalamone.it'
const MAX_EVENTS = 200
const MAX_POST_AGE_DAYS = 60

const WEEKDAYS: Record<string, number> = {
  domenica: 0, lunedi: 1, 'lunedì': 1, martedi: 2, 'martedì': 2, mercoledi: 3, 'mercoledì': 3,
  giovedi: 4, 'giovedì': 4, venerdi: 5, 'venerdì': 5, sabato: 6,
}
const WD = '(domenica|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato)'
const MON = '(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)'
// "Sabato 3 e domenica 4 ottobre", "Domenica 4 ottobre", "dal 10 al 12 ottobre", "Sabato10 e domenica 11 ottobre"
const DATE_WITH_MONTH = new RegExp(
  `(?:${WD}\\s*)?(?:dal\\s+)?(\\d{1,2})(?:\\s*(?:e|al|-|–|/)\\s*(?:${WD}\\s*)?(\\d{1,2}))?\\s+${MON}(?:\\s+(\\d{4}))?`, 'i')
// "Mercoledì 21 dalle ore 20.30" (month omitted)
const DATE_NO_MONTH = new RegExp(`${WD}\\s+(\\d{1,2})\\b(?!\\s*(?:${MON}|[:.]\\d))`, 'i')
const TIME = /(?:ore|dalle|alle|a partire dalle|inizio)\s*(?:ore\s*)?(\d{1,2})(?:[.:](\d{2}))?/i

interface Ymd { y: number; mo: number; d: number }

function wdIndex(s: string): number | undefined {
  return WEEKDAYS[s.toLowerCase().normalize('NFC')]
}

/** First date in the text, relative to the post's publication date. */
function findDate(text: string, post: Date): { start: Ymd; end: Ymd | null; at: number; len: number } | null {
  const m = text.match(DATE_WITH_MONTH)
  if (m && m.index !== undefined && m.index < 400) {
    const mo = IT_MONTHS[m[5].toLowerCase()]
    let y = m[6] ? +m[6] : post.getUTCFullYear()
    // Posts in December list January events
    if (!m[6] && mo < post.getUTCMonth() + 1 - 2) y += 1
    const d1 = +m[2]
    const d2 = m[4] ? +m[4] : null
    if (d1 < 1 || d1 > 31) return null
    return {
      start: { y, mo, d: d1 },
      end: d2 && d2 > d1 && d2 <= 31 ? { y, mo, d: d2 } : null,
      at: m.index, len: m[0].length,
    }
  }
  const n = text.match(DATE_NO_MONTH)
  if (n && n.index !== undefined && n.index < 200) {
    const wd = wdIndex(n[1])
    const day = +n[2]
    if (wd === undefined || day < 1 || day > 31) return null
    // Next date ≥ post date with that day-of-month and weekday (within 3 months)
    for (let k = 0; k < 4; k++) {
      const c = new Date(Date.UTC(post.getUTCFullYear(), post.getUTCMonth() + k, day))
      if (c.getUTCDate() !== day) continue
      if (c.getTime() < post.getTime() - 86400000) continue
      if (c.getUTCDay() === wd) {
        return { start: { y: c.getUTCFullYear(), mo: c.getUTCMonth() + 1, d: day }, end: null, at: n.index, len: n[0].length }
      }
    }
  }
  return null
}

function titleFrom(text: string, dateAt: number, dateLen: number): string {
  let s = text.slice(dateAt + dateLen)
  // Drop leading time / filler phrases
  s = s.replace(/^[\s,]*(?:\d{4})?[\s,]*/, '')
  for (let i = 0; i < 4; i++) {
    s = s.replace(/^(?:,|\s)*(?:a partire\s+)?(?:dalle|alle|ore|dalle ore|alle ore)\s*\d{1,2}(?:[.:]\d{2})?(?:\s*(?:alle|-|–)\s*(?:ore\s*)?\d{1,2}(?:[.:]\d{2})?)?\s*/i, '')
    s = s.replace(/^(?:,|\s)*(?:si tiene|si terrà|torna|tornano|ci sarà|vi aspetta)\s+/i, '')
  }
  s = s.split(/(?<=[a-zà-ü)”"])\.\s|\n/)[0].trim().replace(/[,:;\s]+$/, '').replace(/^[\s,;:–-]+/, '')
  // "presso X si tiene il mercato della terra …" → "il mercato della terra …"
  const verb = s.match(/\b(?:si tiene|si terrà|si svolge|si svolgerà|organizzano|organizza|propone|ospita)\s+(.{15,})$/i)
  if (verb) s = verb[1]
  if (s.length > 110) s = s.slice(0, 107).replace(/\s+\S*$/, '') + '…'
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

interface Section { region: string; town: string; html: string }

function sectionsOf(content: string): Section[] {
  const cut = content.search(/I Mercati della Terra Slow Food/i)
  const body = cut > 0 ? content.slice(0, cut) : content
  const out: Section[] = []
  let region = ''
  const parts = body.split(/(?=<h[34][\s>])/i)
  let cur: Section | null = null
  for (const part of parts) {
    const h = part.match(/^<h([34])[^>]*>([\s\S]*?)<\/h\1>/i)
    if (h) {
      const text = stripHtml(h[2])
      if (h[1] === '3') {
        if (cur) out.push(cur)
        cur = null
        if (text && text.length < 40) region = text
        continue
      }
      if (cur) out.push(cur)
      cur = { region, town: text, html: part.slice(h[0].length) }
    } else if (cur) {
      cur.html += part
    }
  }
  if (cur) out.push(cur)
  return out.filter((s) => s.town && s.town.length < 80)
}

function htmlText(html: string): string {
  return stripHtml(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n'))
}

async function fetchLamone(): Promise<RawEvent[]> {
  const today = new Date().toISOString().slice(0, 10)
  const json = await getText(`${LAMONE}/wp-json/tribe/events/v1/events?per_page=50&start_date=${today}`)
  if (!json) return []
  let data: any
  try { data = JSON.parse(json) } catch { return [] }
  const out: RawEvent[] = []
  for (const e of data?.events ?? []) {
    const startUtc = typeof e.utc_start_date === 'string' ? e.utc_start_date : ''
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(startUtc)) continue
    const starts = new Date(startUtc.replace(' ', 'T') + 'Z')
    if (isNaN(starts.getTime())) continue
    const v = e.venue && !Array.isArray(e.venue) ? e.venue : null
    let lat = parseFloat(v?.geo_lat ?? '')
    let lng = parseFloat(v?.geo_lng ?? '')
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      const geo = await geocodeFirst([
        [v?.venue, v?.address, v?.city].filter(Boolean).join(', '),
        [v?.address, v?.city].filter(Boolean).join(', '),
        v?.city ?? '',
      ].filter((q) => q.trim()))
      if (!geo) continue
      lat = geo.lat; lng = geo.lng
    }
    const endUtc = typeof e.utc_end_date === 'string' ? new Date(e.utc_end_date.replace(' ', 'T') + 'Z') : null
    out.push({
      source: SRC,
      source_id: `sf-it-lamone-${e.id}`,
      source_url: e.url ?? `${LAMONE}/eventi/`,
      title: stripHtml(e.title ?? ''),
      description: stripHtml(e.description ?? '').slice(0, 500),
      organizer: 'Slow Food Romagna Valle del Lamone',
      location_name: [v?.venue, v?.city].filter(Boolean).map((s: string) => stripHtml(s)).join(', ') || 'Romagna',
      lat, lng,
      starts_at: starts.toISOString(),
      ends_at: endUtc && !isNaN(endUtc.getTime()) && endUtc > starts ? endUtc.toISOString() : null,
      cost: e.cost ? stripHtml(String(e.cost)) : 'Vedi evento',
      image_url: e.image?.url ?? null,
    })
  }
  return out
}

export const slowfoodIt: SourceFetcher = {
  name: SRC,
  async fetch() {
    const events: RawEvent[] = []
    const lamone = await fetchLamone()
    events.push(...lamone)

    const json = await getText(`${WP}?categories=${SLOW_WEEK_CAT}&per_page=4&_fields=id,date,link,content`)
    let posts: any[] = []
    try { posts = json ? JSON.parse(json) : [] } catch { posts = [] }

    const seen = new Set<string>()
    for (const post of posts) {
      const postDate = new Date(`${post.date}Z`)
      if (isNaN(postDate.getTime())) continue
      if (Date.now() - postDate.getTime() > MAX_POST_AGE_DAYS * 86400000) continue
      const content: string = post.content?.rendered ?? ''
      for (const sec of sectionsOf(content)) {
        if (events.length >= MAX_EVENTS) break
        if (lamone.length && /slowfoodromagnalamone\.it/i.test(sec.html)) continue
        const text = htmlText(sec.html)
        if (text.length < 40) continue
        if (/\b(online|webinar|in diretta streaming|su zoom)\b/i.test(text.slice(0, 300))) continue
        const date = findDate(text, postDate)
        if (!date) continue

        const after = text.slice(date.at + date.len, date.at + date.len + 120)
        const tm = after.match(TIME)
        let h = 10, mi = 0
        if (tm && +tm[1] >= 6 && +tm[1] <= 23 && (!tm[2] || +tm[2] < 60)) { h = +tm[1]; mi = tm[2] ? +tm[2] : 0 }
        const startsAt = romeIso(date.start.y, date.start.mo, date.start.d, h, mi)
        if (new Date(startsAt).getTime() < Date.now()) continue

        // "Monteu Roero (Cn)" → town + province
        const tm2 = sec.town.match(/^(.*?)\s*\(([A-Za-z]{2})\)\s*$/)
        const town = (tm2 ? tm2[1] : sec.town).trim()
        const prov = tm2 ? tm2[2].toUpperCase() : ''
        const key = `${town}|${startsAt}`
        if (seen.has(key)) continue
        seen.add(key)

        const geo = await geocodeFirst([
          prov ? `${town}, ${prov}` : '',
          sec.region ? `${town}, ${sec.region}` : '',
          town,
        ].filter(Boolean))
        if (!geo) continue

        const snippet = titleFrom(text, date.at, date.len)
        const title = snippet ? `${snippet} — ${town}` : `Slow Food a ${town}`
        const $ = load(sec.html)
        const infoLink = $('a[href]').toArray()
          .map((a) => $(a).attr('href') ?? '')
          .find((href) => /^https?:\/\//.test(href) && !/forms\.gle|google\.com\/forms|shop\.slowfood/.test(href))
        const cost = text.match(/(?:costo|quota|contributo|prezzo)[^.\n]{0,40}?(\d+[\d.,]*\s*(?:euro|€))/i)?.[1]
          ?? (/\b(gratuit[oaie]|ingresso libero)\b/i.test(text) ? 'Free' : null)
        const ends = date.end ? romeIso(date.end.y, date.end.mo, date.end.d, 18, 0) : null

        events.push({
          source: SRC,
          source_id: `sf-it-${hashStr(`${post.id}|${town}|${startsAt}`)}`,
          source_url: infoLink ?? post.link ?? 'https://www.slowfood.it/',
          title: title.slice(0, 200),
          description: text.slice(0, 500),
          organizer: 'Slow Food Italia',
          location_name: [sec.town, sec.region].filter(Boolean).join(', '),
          lat: geo.lat,
          lng: geo.lng,
          starts_at: startsAt,
          ends_at: ends,
          cost: cost ?? 'Vedi evento',
        })
      }
    }
    return events.slice(0, MAX_EVENTS)
  },
}
