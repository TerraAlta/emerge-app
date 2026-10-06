/**
 * Kompetenzplattform Permakultur-Landwirtschaft — permakultur-landwirtschaft.org
 * Project of the Bern university HAFL and the Verein Permakultur-Landwirtschaft
 * (Switzerland; German-language). Lists permaculture-farming courses, farm
 * visits, field days and seminars, mostly in Switzerland, some in DE/AT.
 *
 * https://permakultur-landwirtschaft.org/veranstaltungen/ lists the current
 * events (WordPress posts in category "Veranstaltung"). Date and place are not
 * in the post body (they sit in page-builder fields), so each detail page is
 * fetched and its info block parsed:
 *   "Ort HAFL Länggasse 85 3052 Zollikofen BE Datum Mi, 14. April 2027, 14:00 – 17:00"
 *   "Datum Beginn Seminar 12. März 2027 16:00 Uhr Ende Seminar 14. März 2027 …"
 * Online events are skipped; entries with no time get an assumed 09:00 start.
 * Times are Europe/Zurich (= CET/CEST). Places are geocoded with Nominatim
 * (postcode + town), limited to CH/DE/AT/LI.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'permakultur-lw-de'
const BASE = 'https://permakultur-landwirtschaft.org'
const LIST = `${BASE}/veranstaltungen/`
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_DETAILS = 25

const MONTHS: Record<string, number> = {
  januar: 1, jan: 1, februar: 2, feb: 2, märz: 3, maerz: 3, mär: 3, april: 4, apr: 4, mai: 5,
  juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12,
}

function zurichOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}
/** Europe/Zurich wall-clock → UTC ISO (CET/CEST aware). */
function localIso(y: number, mo: number, d: number, h = 0, mi = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - zurichOffsetMin(guess) * 60000
  return new Date(guess - zurichOffsetMin(first) * 60000).toISOString()
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastGeo = 0
/** Nominatim (CH/DE/AT/LI), ≥1.1 s apart, cached, backs off on 429. */
async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  q = q.replace(/\s+/g, ' ').trim()
  if (!q) return null
  if (geoCache.has(q)) return geoCache.get(q)!
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastGeo + 1100 + attempt * 4000 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ch,de,at,li&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'de' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) continue
      if (!res.ok) return null
      const d = await res.json()
      const lat = parseFloat(d?.[0]?.lat), lng = parseFloat(d?.[0]?.lon)
      const out = lat > 45.7 && lat < 55.1 && lng > 5.8 && lng < 17.2 ? { lat, lng } : null
      geoCache.set(q, out)
      return out
    } catch { /* retry */ }
  }
  return null
}

const STOP = '(?:Ort|Veranstaltungsort|Kursort|Datum|Daten|Kursleitung|Kurskosten|Kosten|Referent\\w*|Zielgruppe\\w*|Link zu|Link zum|Anreise|Treffpunkt|Bild:|Quelle:|Infos|Anmeldung|Teile diesen)'
const field = (text: string, key: string) =>
  [...text.matchAll(new RegExp(`(?:^|\\s)${key}\\s*:?\\s+(.+?)(?=\\s+${STOP}\\b|$)`, 'g'))].map((m) => m[1].trim())

/** Parse the "Datum …" text → start/end (local). */
function parseWhen(s: string): { start: string; end: string | null; timed: boolean } | null {
  // remove weekday names / abbreviations
  const t = s.replace(/\b(Mo|Di|Mi|Do|Fr|Sa|So)\.?,/g, ' ').replace(/\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),?/g, ' ')
  // all "DD. Monat YYYY" / "DD.MM.YYYY" dates in order (with optional bare "DD." before "bis")
  const dates: Array<{ i: number; y: number; mo: number; d: number }> = []
  for (const m of t.matchAll(/(\d{1,2})\.\s*([A-Za-zäÄ]+)\.?\s+(\d{4})/g)) {
    const mo = MONTHS[m[2].toLowerCase()]
    if (mo) dates.push({ i: m.index!, y: +m[3], mo, d: +m[1] })
  }
  for (const m of t.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)) dates.push({ i: m.index!, y: +m[3], mo: +m[2], d: +m[1] })
  dates.sort((a, b) => a.i - b.i)
  if (!dates.length) return null
  let first = dates[0]
  // "12. bis 16. Juli 2026" / "05. – 07. November 2026": bare leading day
  const lead = t.slice(0, first.i).match(/(\d{1,2})\.\s*(?:bis|–|-)\s*$/)
  let endDate = dates.length > 1 ? dates[1] : null
  if (lead) { endDate = first; first = { ...first, d: +lead[1] } }
  const after = t.slice(first.i).replace(/^(\d{1,2})\.\s*([A-Za-zäÄ]+)\.?\s+\d{4}|^\d{1,2}\.\d{1,2}\.\d{4}/, '')
  const tm = after.match(/^[,\s]*(?:ab\s+)?(\d{1,2})[:.](\d{2})(?:\s*Uhr)?(?:\s*(?:[-–]|bis)\s*(\d{1,2})[:.](\d{2}))?/)
  const timed = !!tm
  const start = localIso(first.y, first.mo, first.d, tm ? +tm[1] : 9, tm ? +tm[2] : 0)
  let end: string | null = null
  if (endDate && (endDate.y !== first.y || endDate.mo !== first.mo || endDate.d !== first.d)) {
    const em = t.slice(endDate.i).replace(/^(\d{1,2})\.\s*([A-Za-zäÄ]+)\.?\s+\d{4}|^\d{1,2}\.\d{1,2}\.\d{4}/, '').match(/^[,\s]*(\d{1,2})[:.](\d{2})/)
    end = localIso(endDate.y, endDate.mo, endDate.d, em ? +em[1] : 17, em ? +em[2] : 0)
  } else if (tm?.[3]) {
    end = localIso(first.y, first.mo, first.d, +tm[3], +tm[4])
  }
  if (end && end <= start) end = null
  return { start, end, timed }
}

export const permakulturLwDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const list = await getText(LIST)
    if (!list) return []
    // Links of the "Aktuelle Veranstaltungen" block (stop at the archive link)
    const from = list.indexOf('Aktuelle Veranstaltungen')
    const to = list.indexOf('Veranstaltungsarchiv', from + 1)
    const cur = list.slice(Math.max(0, from), to > from ? to : undefined)
    const links = [...new Set(
      [...cur.matchAll(/href="(https:\/\/permakultur-landwirtschaft\.org\/[a-z0-9-]+\/)"/g)].map((m) => m[1]),
    )].filter((u) => !/\/(veranstaltungen|neuigkeiten|kontakt|newsletter|spenden|impressum|datenschutz|forschung|bibliothek|ueber-uns|landwirtschaft|mitglied|agenda|faq)[^/]*\/$/i.test(u))
      .filter((u) => !/online|webinar/i.test(u))

    const now = Date.now()
    const events: RawEvent[] = []
    for (const url of links.slice(0, MAX_DETAILS)) {
      const html = await getText(url)
      if (!html) continue
      const fullTitle = stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '')
        || stripHtml(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').split(' - ')[0]
      // "… – Kurs am 13. Oktober 2026" / "… vom 18. bis 20. Dezember 2026" → drop the date tail
      const title = fullTitle
        .replace(/\s*(?:[–-]\s*(?:[\wäöüÄÖÜ-]+\s+){0,2})?(?:am|vom|von)\s+\d{1,2}\.\s*(?:[A-Za-zäÄ]+\s*)?(?:\d{4})?(?:\s*(?:bis|[–-])\s*.*)?$/i, '')
        .replace(/\s*[–-]\s*$/, '').trim() || fullTitle
      const clean = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/g, '')
      const text = stripHtml(clean.replace(/<[^>]+>/g, ' '))
      const endAt = text.indexOf('Teile diesen Beitrag')
      const main = endAt > 0 ? text.slice(0, endAt) : text
      const tail = main.slice(-1500)
      const ort = field(tail, '(?:Veranstaltungs)?[Oo]rt').pop() ?? ''
      const datum = field(tail, '(?:Datum|Daten|Termin)').pop() ?? ''
      if (!datum || /online/i.test(`${ort} ${datum}`) || !ort) continue
      const when = parseWhen(datum)
      if (!when || Date.parse(when.start) < now + 3600_000) continue
      // Title says "… November 2026" but the info block says November 2027 → conflicting, skip
      const td = fullTitle.match(/(\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})/)
      if (td && MONTHS[td[2].toLowerCase()]) {
        const ts = localIso(+td[3], MONTHS[td[2].toLowerCase()], +td[1], 12)
        if (ts.slice(5, 7) === when.start.slice(5, 7) && ts.slice(0, 4) !== when.start.slice(0, 4)) continue
      }

      // Geocode: "… 3052 Zollikofen BE" → "3052 Zollikofen", else whole string
      const plz = ort.match(/(?:CH-|D-|A-)?\b(\d{4,5})\s+([A-ZÄÖÜ][\wäöüß.\-]*(?:\s+(?:am|an|im|bei)\s+[\wäöüß.\-]+)?)/)
      const queries = [plz ? `${plz[1]} ${plz[2]}` : '', ort.replace(/\b[A-Z]{2}$/, '').trim()].filter(Boolean)
      let pos: { lat: number; lng: number } | null = null
      for (const q of queries) { pos = await geocode(q); if (pos) break }
      if (!pos) continue

      const intro = stripHtml(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '')
        || main.slice(main.indexOf(title) + title.length, main.indexOf(title) + title.length + 400).trim()
      events.push({
        source: SRC,
        source_id: `pela-${url.replace(/\/$/, '').split('/').pop()!.slice(0, 80)}`,
        source_url: url,
        title,
        description: [intro.slice(0, 600), `Ort: ${ort}.`, `Datum: ${datum.slice(0, 160)}.`].join(' '),
        organizer: 'Kompetenzplattform Permakultur-Landwirtschaft',
        location_name: ort.slice(0, 200),
        lat: pos.lat,
        lng: pos.lng,
        starts_at: when.start,
        ends_at: when.end,
        cost: 'Siehe Veranstaltung',
      })
    }
    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return events
  },
}
