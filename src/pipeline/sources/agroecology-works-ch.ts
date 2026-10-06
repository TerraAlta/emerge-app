/**
 * Agroecology Works! — agroecologyworks.ch
 * Swiss agroecology network (c/o Biovision). Its main public programme is
 * the yearly "Tage der Agrarökologie" (≈ late Sept – early Nov): ~100 farm
 * visits, Solawi open days, workshops, film evenings and talks all over
 * Switzerland (DE/FR/IT).
 *
 * The site is Kirby CMS. The listing
 *   https://www.agroecologyworks.ch/de/tage-der-agraroekologie/<year>/events
 * renders one card per event: link, "card-date" (26.09.2026 /
 * 03.–04.10.2026 / 27.10.–10.11.2026), title, organiser, "10:00 - 16:00 |
 * <canton>" and a "card-typ online" marker for online events. The card only
 * names the canton, so each event's detail page is read for the exact
 * address ("Ort") and time ("Zeit"); at most ~38 detail pages per run,
 * soonest first. Online events are skipped. Times are Europe/Zurich; with
 * no time 10:00 local is used. Addresses are geocoded (Nominatim, CH).
 * Both this year's and next year's programme pages are tried.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, sleep, zurichIso, geocodeChFirst, ONLINE_RE } from './ch-common'

const SRC = 'agroecology-works-ch'
const BASE = 'https://www.agroecologyworks.ch/de/tage-der-agraroekologie'
const MAX_DETAILS = 38

interface Card { url: string; date: string; title: string; org: string; time: string; canton: string; online: boolean; img: string | null }

function parseCards(html: string): Card[] {
  const out: Card[] = []
  const re = /<a href="([^"]+\/tage-der-agraroekologie\/\d{4}\/events\/[^"]+)" class="card">([\s\S]*?)<\/a>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const b = m[2]
    const infos = (b.match(/class="card-infos">([\s\S]*?)<\/span>/)?.[1] ?? '').split(/<br\s*\/?>/i).map((s) => stripHtml(s))
    const tc = infos[1] ?? ''
    const bar = tc.lastIndexOf('|')
    out.push({
      url: m[1],
      date: stripHtml(b.match(/class="card-date">([\s\S]*?)<\/span>/)?.[1] ?? ''),
      title: stripHtml(b.match(/class="card-title">([\s\S]*?)<\/span>/)?.[1] ?? ''),
      org: infos[0] ?? '',
      time: bar >= 0 ? tc.slice(0, bar).trim() : tc,
      canton: bar >= 0 ? tc.slice(bar + 1).trim() : '',
      online: /card-typ online/.test(b),
      img: b.match(/<img[^>]*src="([^"]+)"/)?.[1] ?? null,
    })
  }
  return out
}

/** "26.09.2026" | "03.–04.10.2026" | "27.10.–10.11.2026" → start/end parts. */
function parseRange(s: string): { y: number; mo: number; d: number; y2: number; mo2: number; d2: number } | null {
  const t = s.replace(/\s+/g, '')
  const m = t.match(/^(\d{1,2})\.(?:(\d{1,2})\.)?(\d{4})?(?:[–-](\d{1,2})\.(\d{1,2})\.(\d{4}))?$/)
  if (!m) return null
  const y2 = +(m[6] ?? m[3]); const mo2 = +(m[5] ?? m[2]); const d2 = +(m[4] ?? m[1])
  const y = +(m[3] ?? m[6]); const mo = +(m[2] ?? m[5]); const d = +m[1]
  if (!y || !mo || !d) return null
  return { y, mo, d, y2, mo2, d2 }
}

/** First "HH:MM" (or "H.MM") and the following "- HH:MM" in a Zeit string. */
function parseTime(s: string): { h: number; mi: number; h2?: number; mi2?: number } | null {
  const m = s.match(/\b(\d{1,2})[:.](\d{2})(?:\s*(?:Uhr)?\s*[–-]\s*(?:ca\.\s*)?(\d{1,2})[:.h](\d{2}))?/)
  if (!m || +m[1] > 23) return null
  return { h: +m[1], mi: +m[2], h2: m[3] ? +m[3] : undefined, mi2: m[4] ? +m[4] : undefined }
}

function field(html: string, label: string): string {
  const re = new RegExp(`<h3>\\s*${label}\\s*</h3>\\s*</div>\\s*<div>([\\s\\S]*?)</div>`, 'i')
  return stripHtml(html.match(re)?.[1] ?? '')
}

export const agroecologyWorksCh: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = Date.now()
    const y0 = new Date(now).getUTCFullYear()
    const cards: Card[] = []
    for (const y of [y0, y0 + 1]) {
      const html = await getText(`${BASE}/${y}/events`)
      if (html) cards.push(...parseCards(html))
      await sleep(800)
    }

    const cand = cards
      .map((c) => ({ c, r: parseRange(c.date) }))
      .filter((x): x is { c: Card; r: NonNullable<ReturnType<typeof parseRange>> } => !!x.r)
      .filter(({ c }) => !c.online && !ONLINE_RE.test(c.title))
      // start day must still be ahead (the pipeline drops anything already started)
      .filter(({ r }) => Date.UTC(r.y, r.mo - 1, r.d, 23) > now)
      .sort((a, b) => Date.UTC(a.r.y, a.r.mo - 1, a.r.d) - Date.UTC(b.r.y, b.r.mo - 1, b.r.d))

    const out: RawEvent[] = []
    const seen = new Set<string>()
    let details = 0
    for (const { c, r } of cand) {
      if (seen.has(c.url) || details >= MAX_DETAILS) continue
      seen.add(c.url)
      details++
      await sleep(500)
      const html = await getText(c.url)
      if (!html) continue
      const ort = field(html, 'Ort')
      if (!ort || ONLINE_RE.test(ort) || /card-typ online/.test(html.match(/<h3>\s*Ort\s*<\/h3>[\s\S]{0,300}/)?.[0] ?? '')) continue
      const zeit = field(html, 'Zeit') || c.time
      const tm = parseTime(zeit)
      const start = zurichIso(r.y, r.mo, r.d, tm?.h ?? 10, tm?.mi ?? 0)
      if (!start || Date.parse(start) < now) continue
      let end: string | null = null
      if (tm?.h2 !== undefined && tm.h2 < 24) end = zurichIso(r.y2, r.mo2, r.d2, tm.h2, tm.mi2 ?? 0)
      else if (r.d2 !== r.d || r.mo2 !== r.mo) end = zurichIso(r.y2, r.mo2, r.d2, 17, 0)

      const pc = ort.match(/\b(\d{4})\s+([A-ZÄÖÜÉÈ][\wäöüéèàç.'-]+(?:[ -][A-ZÄÖÜÉÈ]?[\wäöüéèàç.'-]+)?)/)
      const queries = [ort, pc ? `${pc[1]} ${pc[2]}` : '', pc ? pc[2] : '', c.canton && pc ? `${pc[2]}, ${c.canton}` : '']
      const geo = await geocodeChFirst(queries.filter(Boolean))
      if (!geo) continue

      const desc = stripHtml(field(html, 'Kurzbeschrieb') || (html.match(/class="event-content">([\s\S]*?)<\/div>/)?.[1] ?? ''))
      out.push({
        source: SRC,
        source_id: `aw-ch-${hashStr(c.url)}`,
        source_url: c.url,
        title: c.title.replace(/^COMPLET\s+/i, ''),
        description: [desc, field(html, 'Sprache') ? `Sprache: ${field(html, 'Sprache')}` : '', 'Tage der Agrarökologie'].filter(Boolean).join(' — ').slice(0, 700),
        organizer: field(html, 'Organisator\\*in') || c.org || 'Agroecology Works!',
        location_name: ort,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: start,
        ends_at: end && end > start ? end : null,
        cost: field(html, 'Kosten') || 'Siehe Veranstaltung',
        image_url: html.match(/class="event-image">\s*<img src="([^"]+)"/)?.[1] ?? c.img,
      })
      if (out.length >= 200) break
    }
    return out
  },
}
