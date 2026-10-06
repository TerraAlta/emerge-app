/**
 * Gemeinschaft Schloss Glarisegg — schloss-glarisegg.ch
 * Ecovillage / community (GEN member) on Lake Constance near Steckborn TG,
 * with its "Akademie für Gemeinschaftsbildung" seminar programme:
 * community-building intensives, permaculture garden days, Forum,
 * sound/mantra evenings, guided tours.
 *
 * NOTE: glarisegg.ch (the old URL here) is a different organisation — the
 * Schulstiftung Glarisegg (a special-needs school) — not the community.
 *
 * https://schloss-glarisegg.ch/kalender/ server-renders the upcoming
 * seminars (WordPress CPT "seminar_events"): link, title, short teaser and a
 * date line without the year ("Sa. 10. Okt. 09:00 – Sa. 10. Okt. 14:00").
 * Each detail page has a "Seminardaten" block with the full dates
 * ("Beginn Montag, 12. Oktober 2026 14:00", "Ende …"), "Ort" and
 * "Seminarkosten", so detail pages are read (≤ 24). If a detail page fails,
 * the year is inferred from the listing's weekday. Online sessions are skipped.
 * Times are Europe/Zurich.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, sleep, monthNum, zurichIso, geocodeCh, ONLINE_RE } from './ch-common'

const SRC = 'glarisegg-ch'
const ORG = 'Gemeinschaft Schloss Glarisegg'
const BASE = 'https://schloss-glarisegg.ch'
const LIST = `${BASE}/kalender/`
const MAX_DETAILS = 24
// Schloss Glarisegg, Seestrasse, 8266 Steckborn (OSM building)
const HOME = { lat: 47.6548, lng: 8.9567, name: 'Schloss Glarisegg, Glarisegg 1, 8266 Steckborn' }

const WD: Record<string, number> = { so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6 }

interface DT { y: number; mo: number; d: number; h?: number; mi?: number }

/** "Montag, 12. Oktober 2026 14:00" → parts */
function parseFull(s: string): DT | null {
  const m = s.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\.?\s+(\d{4})(?:[,\s]+(\d{1,2})[:.](\d{2}))?/)
  if (!m) return null
  const mo = monthNum(m[2])
  if (!mo) return null
  return { y: +m[3], mo, d: +m[1], h: m[4] ? +m[4] : undefined, mi: m[5] ? +m[5] : undefined }
}

/** Listing part "Sa. 10. Okt. 09:00" (no year) → parts, year inferred from the weekday. */
function parseShort(s: string, notBefore: number): DT | null {
  const m = s.match(/([A-Za-z]{2})\.?\s+(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\.?(?:\s+(\d{1,2})[:.](\d{2}))?/)
  if (!m) return null
  const wd = WD[m[1].toLowerCase()]
  const mo = monthNum(m[3])
  const d = +m[2]
  if (wd === undefined || !mo) return null
  const y0 = new Date(notBefore).getUTCFullYear()
  for (let y = y0; y <= y0 + 2; y++) {
    const t = Date.UTC(y, mo - 1, d)
    if (new Date(t).getUTCDay() === wd && t >= notBefore - 2 * 86400000) {
      return { y, mo, d, h: m[4] ? +m[4] : undefined, mi: m[5] ? +m[5] : undefined }
    }
  }
  return null
}

function iso(p: DT | null): string | null {
  if (!p) return null
  return p.h !== undefined ? zurichIso(p.y, p.mo, p.d, p.h, p.mi ?? 0) : zurichIso(p.y, p.mo, p.d, 10, 0)
}

/** Value of a "Seminardaten"/"Informationen" field on a detail page. */
function field(html: string, label: string): string {
  const re = new RegExp(`<h3[^>]*>\\s*${label}\\s*</h3>\\s*<div class="el-content[^"]*">([\\s\\S]*?)</div>`, 'i')
  const m = html.match(re)
  return m ? stripHtml(m[1]) : ''
}

export const glariseggCh: SourceFetcher = {
  name: SRC,
  async fetch() {
    let html = await getText(LIST)
    if (!html?.includes('/seminar_events/')) {
      // The page cache occasionally serves an empty shell: retry once
      await sleep(3000)
      html = await getText(LIST)
    }
    if (!html) return []
    const now = Date.now()
    const items: { url: string; title: string; date: string; desc: string; img: string | null; cat: string }[] = []
    const re = /<a href="(https:\/\/schloss-glarisegg\.ch\/seminar_events\/[^"]+)" class="item">([\s\S]*?)<\/a>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      const b = m[2]
      const title = stripHtml(b.match(/class="title[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? '')
      const date = stripHtml(b.match(/class="date[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? '')
      if (!title || !date) continue
      items.push({
        url: m[1], title, date,
        desc: stripHtml(b.match(/class="desc">([\s\S]*?)<\/div>/)?.[1] ?? ''),
        img: b.match(/background-image:\s*url\(([^)]+)\)/)?.[1] ?? null,
        cat: stripHtml(b.match(/class="cat"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''),
      })
    }

    const out: RawEvent[] = []
    const seen = new Set<string>()
    let details = 0
    for (const it of items) {
      if (seen.has(it.url)) continue
      seen.add(it.url)
      if (ONLINE_RE.test(it.title) || /online/i.test(it.url)) continue

      // Listing fallback (year from weekday)
      const [a, b] = it.date.split(/\s+[–-]\s+/)
      let start = iso(parseShort(a ?? '', now))
      let endP: DT | null = null
      if (b) {
        endP = /\d{1,2}\.\s*[A-Za-zäöü]/.test(b) ? parseShort(b, now) : null
        if (!endP && /^\d{1,2}[:.]\d{2}$/.test(b.trim())) {
          const s = parseShort(a ?? '', now)
          const t = b.trim().split(/[:.]/)
          if (s) endP = { ...s, h: +t[0], mi: +t[1] }
        }
      }
      let end = iso(endP)
      let place = ''
      let cost = ''

      if (details < MAX_DETAILS) {
        details++
        await sleep(500)
        const d = await getText(it.url)
        if (d) {
          const s2 = iso(parseFull(field(d, 'Beginn')))
          const e2 = iso(parseFull(field(d, 'Ende')))
          if (s2) { start = s2; end = e2 }
          place = field(d, 'Ort')
          cost = field(d, 'Seminarkosten') || field(d, 'Kosten')
        }
      }
      if (!start || Date.parse(start) < now) continue
      if (ONLINE_RE.test(place)) continue

      let geo: { lat: number; lng: number } = HOME
      let locName = place || HOME.name
      if (place && !/glarisegg|steckborn/i.test(place)) {
        const pc = place.match(/\b(\d{4})\s+([A-ZÄÖÜ][\wäöüéè.-]+(?:\s[A-ZÄÖÜ][\wäöüéè.-]+)?)/)
        const g = await geocodeCh(pc ? `${pc[1]} ${pc[2]}` : place)
        if (!g) continue
        geo = g
      } else if (!place) {
        locName = HOME.name
      }

      out.push({
        source: SRC,
        source_id: `gl-ch-${hashStr(it.url)}`,
        source_url: it.url,
        title: it.title,
        description: [it.desc, it.cat ? `Kategorie: ${it.cat}` : ''].filter(Boolean).join(' — ').slice(0, 600),
        organizer: ORG,
        location_name: locName,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: start,
        ends_at: end && end > start ? end : null,
        cost: cost ? cost.slice(0, 120) : 'Siehe Veranstaltung',
        image_url: it.img,
      })
      if (out.length >= 200) break
    }
    return out
  },
}
