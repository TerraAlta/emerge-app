/**
 * Transition Netzwerk D-A-CH — transition-initiativen.org
 * The German-speaking Transition Towns network's shared event calendar
 * (workshops, retreats, Permakultur courses, Dragon Dreaming, local talks in
 * DE/AT/CH).
 *
 * The calendar is a Drupal 7 view at https://www.transition-initiativen.org/events
 * (paged with ?page=N). Each row has title/link, "Wann: 08.10.2026 - 16:00",
 * "Wo: 38489 Beetzendorf" (often empty) and a teaser. Each event's detail page
 * has the full duration ("Sonntag, 11. Oktober 2026 - 20:00 bis Freitag,
 * 16. Oktober 2026 - 13:00") and an "Adresse:" field, so detail pages are read
 * too. Webinars/online courses and events with no address are skipped.
 * Times are local (Europe/Berlin = Vienna = Zurich). Addresses are geocoded
 * with Nominatim (DE/AT/CH).
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'transition-de'
const BASE = 'https://www.transition-initiativen.org'
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_LIST_PAGES = 5
const MAX_DETAILS = 20

const MONTHS: Record<string, number> = {
  januar: 1, jänner: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6, juli: 7,
  august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
}

function berlinOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}
/** Europe/Berlin wall-clock → UTC ISO (CET/CEST aware). */
function berlinIso(y: number, mo: number, d: number, h = 0, mi = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - berlinOffsetMin(guess) * 60000
  return new Date(guess - berlinOffsetMin(first) * 60000).toISOString()
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
/** Nominatim (DE/AT/CH), ≥1.1 s apart, cached, backs off on 429. */
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
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de,at,ch&q=${encodeURIComponent(q)}`,
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

/** "Sonntag, 11. Oktober 2026 - 20:00" → parts */
function parseLong(s: string): { y: number; mo: number; d: number; h?: number; mi?: number } | null {
  const m = s.match(/(\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})(?:\s*-\s*(\d{1,2}):(\d{2}))?/)
  const mo = m ? MONTHS[m[2].toLowerCase()] : undefined
  if (!m || !mo) return null
  return { y: +m[3], mo, d: +m[1], h: m[4] ? +m[4] : undefined, mi: m[5] ? +m[5] : undefined }
}

interface Row { url: string; title: string; when: string; wo: string; teaser: string }

export const transitionDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const rows: Row[] = []
    for (let p = 0; p < MAX_LIST_PAGES; p++) {
      const html = await getText(p ? `${BASE}/events?page=${p}` : `${BASE}/events`)
      if (!html) break
      let got = 0
      for (const r of html.split('<div class="views-row ').slice(1)) {
        const a = r.match(/<h2 class="field-content"><a href="([^"]+)">([\s\S]*?)<\/a>/)
        if (!a) continue
        got++
        rows.push({
          url: new URL(a[1], BASE).toString(),
          title: stripHtml(a[2]).replace(/^\*+|\*+$/g, '').trim(),
          when: stripHtml(r.match(/views-field-field-duration[\s\S]*?<span class="field-content">([\s\S]*?)<\/span>\s*<\/div>/)?.[1] ?? ''),
          wo: stripHtml(r.match(/Wo: <\/strong>\s*<span class="field-content">([\s\S]*?)<\/span>/)?.[1] ?? ''),
          teaser: stripHtml(r.match(/views-field-body">\s*<div class="field-content">([\s\S]*?)<\/div>/)?.[1] ?? ''),
        })
      }
      if (!got || !html.includes(`/events?page=${p + 1}`)) break
    }

    const now = Date.now()
    const online = /\b(online|webinar|zoom|digital|livestream|videokonferenz)/i
    const events: RawEvent[] = []
    let details = 0
    for (const row of rows) {
      if (online.test(row.title) || online.test(row.teaser.slice(0, 120))) continue
      // List date "08.10.2026 - 16:00" (quick filter before fetching details)
      const lm = row.when.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*-\s*(\d{1,2}):(\d{2}))?/)
      if (!lm) continue
      if (Date.parse(berlinIso(+lm[3], +lm[2], +lm[1], lm[4] ? +lm[4] : 23, lm[5] ? +lm[5] : 59)) < now + 3600_000) continue
      if (details >= MAX_DETAILS) break

      const html = await getText(row.url)
      details++
      let startIso = berlinIso(+lm[3], +lm[2], +lm[1], lm[4] ? +lm[4] : 10, lm[5] ? +lm[5] : 0)
      let endIso: string | null = null
      let addr = row.wo
      let org = ''
      let website = ''
      let body = row.teaser
      if (html) {
        const field = (name: string) => stripHtml(html.match(new RegExp(`field-name-field-${name}[\\s\\S]*?<div class="field-items">([\\s\\S]*?)<\\/div>\\s*<\\/div>\\s*<\\/div>`))?.[1] ?? '')
        const startTxt = stripHtml(html.match(/class="date-display-(?:start|single)"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '')
        const endTxt = stripHtml(html.match(/class="date-display-end"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '')
        const s = parseLong(startTxt)
        if (s) startIso = berlinIso(s.y, s.mo, s.d, s.h ?? (lm[4] ? +lm[4] : 10), s.mi ?? (lm[5] ? +lm[5] : 0))
        const e = parseLong(endTxt)
        if (e) endIso = berlinIso(e.y, e.mo, e.d, e.h ?? 17, e.mi ?? 0)
        else if (s) {
          const t = endTxt.match(/^(\d{1,2}):(\d{2})$/)
          if (t) endIso = berlinIso(s.y, s.mo, s.d, +t[1], +t[2])
        }
        const a = field('adresse') || field('address') || field('location')
        if (a) addr = a.replace(/\s*(Deutschland|Österreich|Schweiz|Germany|Austria|Switzerland)\s*$/i, '').trim()
        org = field('organized-by')
        website = html.match(/field-name-field-website[\s\S]*?href="([^"]+)"/)?.[1] ?? ''
        const b = stripHtml(html.match(/field-name-body[\s\S]*?<div class="field-item even">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)?.[1] ?? '')
        if (b) body = b
      }
      if (!addr || online.test(addr)) continue
      if (Date.parse(startIso) < now + 3600_000) continue
      if (endIso && endIso <= startIso) endIso = null

      const plz = addr.match(/\b(\d{4,5})\s+([A-ZÄÖÜ][\wäöüß.\-]*(?:\s*\/\s*[A-ZÄÖÜ][\wäöüß.\-]*)?)/)
      const queries = [addr, plz ? `${plz[1]} ${plz[2].split('/')[0].trim()}` : ''].filter(Boolean)
      let pos: { lat: number; lng: number } | null = null
      for (const q of queries) { pos = await geocode(q.replace(/\bCH-/, '')); if (pos) break }
      if (!pos) continue

      events.push({
        source: SRC,
        source_id: `tt-${row.url.split('/').pop()}`,
        source_url: row.url,
        title: row.title,
        description: [body.slice(0, 700), org ? `Organisiert von: ${org}.` : '', website ? `Website: ${website}` : ''].filter(Boolean).join(' '),
        organizer: org || 'Transition Netzwerk D-A-CH',
        location_name: addr.slice(0, 200),
        lat: pos.lat,
        lng: pos.lng,
        starts_at: startIso,
        ends_at: endIso,
        cost: 'Siehe Veranstaltung',
      })
    }
    return events
  },
}
