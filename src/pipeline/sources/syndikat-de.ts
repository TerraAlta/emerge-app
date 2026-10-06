/**
 * Mietshäuser Syndikat — syndikat.org
 * Federation of ~200 collectively owned, de-commodified housing projects.
 *
 * The only public dates are on https://www.syndikat.org/termine/ — a short,
 * hand-written WordPress page:
 *   <li><strong>Freitag, 13.11.2026, 19:00 Uhr:  Beratung Hannover</strong><br />
 *     Info- und Vernetzungs-Kneipe<br />Ort: Projekt Solidarischer Horst, Badenstedt
 * plus the list of general assemblies ("Mitgliederversammlungen"):
 *   Samstag, 31.10.2026 GREIFSWALD
 * Online advice sessions are skipped. Assemblies have no time on the page;
 * they start Saturday morning, so 10:00 Europe/Berlin is assumed.
 * Places are geocoded with Nominatim (city taken from the heading if needed).
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'syndikat-de'
const URL = 'https://www.syndikat.org/termine/'
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'

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

const geoCache = new Map<string, { lat: number; lng: number } | null>()
let lastGeo = 0
/** Nominatim (Germany), ≥1.1 s apart, cached, backs off on 429. */
async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache.has(q)) return geoCache.get(q)!
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastGeo + 1100 + attempt * 4000 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastGeo = Date.now()
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'de' }, signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 429 || res.status >= 500) continue
      if (!res.ok) return null
      const d = await res.json()
      const lat = parseFloat(d?.[0]?.lat), lng = parseFloat(d?.[0]?.lon)
      const out = lat > 47.2 && lat < 55.1 && lng > 5.8 && lng < 15.1 ? { lat, lng } : null
      geoCache.set(q, out)
      return out
    } catch { /* retry */ }
  }
  return null
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())

interface Item { y: number; mo: number; d: number; h: number; mi: number; timed: boolean; title: string; detail: string; ort: string; city: string }

export const syndikatDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    let html: string
    try {
      const res = await fetch(URL, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) })
      if (!res.ok) return []
      html = await res.text()
    } catch {
      return []
    }
    const body = html.match(/<div class="entry-content[\s\S]*?<\/article>/)?.[0] ?? html
    const items: Item[] = []

    // 1) Advice / networking meetings: <li><strong>Tag, DD.MM.YYYY, HH:MM Uhr: Title</strong><br/>…
    for (const li of body.match(/<li>\s*<strong>[\s\S]*?<\/li>/g) ?? []) {
      const lines = li.split(/<br\s*\/?>/i).map((s) => stripHtml(s)).filter(Boolean)
      const head = lines[0] ?? ''
      const m = head.match(/(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(?:(\d{1,2})[:.](\d{2})\s*Uhr)?\s*:\s*(.+)$/)
      if (!m) continue
      const ort = (lines.find((l) => /^Ort:/i.test(l)) ?? '').replace(/^Ort:\s*/i, '')
      if (!ort || /online|zoom|digital|video/i.test(ort)) continue
      const title = m[6].trim()
      const detail = lines.slice(1).filter((l) => !/^(Ort|Details)/i.test(l)).join(' ')
      items.push({
        y: +m[3], mo: +m[2], d: +m[1], h: m[4] ? +m[4] : 10, mi: m[5] ? +m[5] : 0, timed: !!m[4],
        title, detail, ort, city: title.replace(/^(Beratung|Koordination|Regionale Beratung)\s+/i, ''),
      })
    }

    // 2) General assemblies: "Samstag[,] DD.MM.YYYY CITY"
    for (const m of body.matchAll(/(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),?\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\s+([A-ZÄÖÜ][A-ZÄÖÜß\- ]{2,})(?=<|\n)/g)) {
      const city = titleCase(m[4].trim())
      items.push({
        y: +m[3], mo: +m[2], d: +m[1], h: 10, mi: 0, timed: false,
        title: `Mitgliederversammlung des Mietshäuser Syndikats in ${city}`,
        detail: 'Bundesweite Mitgliederversammlung der Hausprojekte und Initiativen im Mietshäuser Syndikat.',
        ort: city, city,
      })
    }

    const now = Date.now()
    const events: RawEvent[] = []
    for (const it of items) {
      const start = berlinIso(it.y, it.mo, it.d, it.h, it.mi)
      if (Date.parse(start) < now + 3600_000) continue
      let pos: { lat: number; lng: number } | null = null
      if (it.ort !== it.city) {
        pos = await geocode(`${it.ort}, ${it.city}`)
        const last = it.ort.split(',').pop()!.trim()
        if (!pos && last !== it.ort) pos = await geocode(`${last}, ${it.city}`)
      }
      pos = pos ?? (await geocode(it.city))
      if (!pos) continue
      events.push({
        source: SRC,
        source_id: `syndikat-${start.slice(0, 10)}-${it.city.toLowerCase().replace(/[^a-zäöüß]+/g, '-')}`,
        source_url: URL,
        title: it.detail && it.detail.length < 80 && !it.title.includes(it.detail) ? `${it.title}: ${it.detail}` : it.title,
        description: [it.detail, `Ort: ${it.ort}${it.ort !== it.city ? ` (${it.city})` : ''}.`, it.timed ? '' : 'Uhrzeit siehe Website.'].filter(Boolean).join(' '),
        organizer: 'Mietshäuser Syndikat',
        location_name: it.ort !== it.city ? `${it.ort}, ${it.city}` : it.city,
        lat: pos.lat,
        lng: pos.lng,
        starts_at: start,
        ends_at: null,
        cost: 'Kostenlos',
      })
    }
    return events
  },
}
