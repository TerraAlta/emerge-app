/**
 * GAS — Gruppi di Acquisto Solidale / Rete Italiana Economia Solidale
 * economiasolidale.net is the national portal of the GAS and DES networks
 * (RIES, Tavolo RES). Its "Calendario" page (Astro + FullCalendar) loads
 * every appointment from one JSON file:
 *   /eventi.json → [{ id, title, start: "YYYY-MM-DD", end, url: "/content/…" }]
 * For upcoming entries we read the detail page (≤ 25), which states
 * "Data: …" and "Luogo: <town>" (e.g. "Luogo: Torino"); online appointments
 * are skipped, the town is geocoded via Nominatim.
 *
 * The feed has dates only (no times): we assume 10:00 Europe/Rome.
 * (The old retegas.org site is an abandoned CMS now stuffed with hotel spam
 * links, with no events.)
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, romeIso, geocodeFirst } from './italy-common'

const SRC = 'gas-it'
const BASE = 'https://economiasolidale.net'
const MAX_DETAIL = 25
const MAX_EVENTS = 200

function ymd(s: unknown): [number, number, number] | null {
  if (typeof s !== 'string') return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? [+m[1], +m[2], +m[3]] : null
}

export const gasIt: SourceFetcher = {
  name: SRC,
  async fetch() {
    const json = await getText(`${BASE}/eventi.json`)
    if (!json) return []
    let items: any[]
    try { items = JSON.parse(json) } catch { return [] }
    if (!Array.isArray(items)) return []

    const today = new Date().toISOString().slice(0, 10)
    const upcoming = items
      .filter((e) => typeof e?.start === 'string' && e.start.slice(0, 10) >= today && e.title && e.url)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, MAX_DETAIL)

    const events: RawEvent[] = []
    for (const e of upcoming) {
      if (events.length >= MAX_EVENTS) break
      const start = ymd(e.start)
      if (!start) continue
      const startsAt = romeIso(start[0], start[1], start[2], 10, 0)
      if (new Date(startsAt).getTime() < Date.now()) continue

      const url = new URL(e.url, BASE).toString()
      const html = await getText(url)
      if (!html) continue
      const field = (label: string): string => {
        const m = html.match(new RegExp(`field__label">${label}:</div>\\s*<div class="field__items">([\\s\\S]*?)</div>\\s*</div>`))
        return m ? stripHtml(m[1].replace(/<\/div>/g, ', ')).replace(/[,\s]+$/, '') : ''
      }
      const luogo = field('Luogo')
      const dove = stripHtml(html.match(/Dove:[\s\S]{0,400}?<a[^>]*>([^<]+)<\/a>/)?.[1] ?? '')
      const firstP = html.match(/field__label">Luogo:[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1] ?? ''
      const place = luogo || dove
      const title = stripHtml(String(e.title))
      if (!place || /\b(online|on-line|webinar|zoom|streaming)\b/i.test(`${place} ${title}`)) continue

      const geo = await geocodeFirst([place, place.split(/[,(]/)[0].trim()].filter(Boolean))
      if (!geo) continue

      const body = stripHtml(firstP)
      const end = ymd(e.end)
      const endsAt = end && end.join('-') !== start.join('-') ? romeIso(end[0], end[1], end[2], 18, 0) : null

      events.push({
        source: SRC,
        source_id: `gas-it-${e.id ?? hashStr(url)}`,
        source_url: url,
        title,
        description: (body || title).slice(0, 500),
        organizer: 'Rete Italiana Economia Solidale (GAS/DES)',
        location_name: place.slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startsAt,
        ends_at: endsAt,
        cost: 'Vedi evento',
      })
    }
    return events
  },
}
