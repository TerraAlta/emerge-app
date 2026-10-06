/**
 * Permakultur Schweiz / Permaculture Romande — Swiss permaculture courses,
 * guided tours, PDC modules and workshops (DE/FR/IT).
 *
 * 1. Verein Permakultur Schweiz — https://www.permakultur.ch/kurse
 *    A Wix site with the Wix Events app: every listed event is embedded in
 *    the page HTML as JSON (UTC start/end, location name/address and
 *    coordinates, type 1 = online). Read with extractWixEvents.
 * 2. Association Permaculture Romande — https://www.permaculture.ch/evenements
 *    A FullCalendar fed by GET /evenements?start=…&end=… (JSON: title, start
 *    date, url, all dates). The place and hours are only in each event's free
 *    text, so the (few) detail pages are read and the place is extracted from
 *    phrases like "à Ballens (VD)", "à Donneloye, canton …" or a " - Town"
 *    subtitle; events whose place can't be found or geocoded are skipped.
 *    Hours from "de 14h à 17h" / "9h30 à 17h30", else 10:00 local.
 *
 * (permaculture-suisse.ch no longer resolves.) Times are Europe/Zurich.
 * The HAFL/permakultur-landwirtschaft.org calendar is a separate source
 * (permakultur-lw-de) and is not read here.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, sleep, zurichIso, geocodeChFirst, extractWixEvents, ONLINE_RE } from './ch-common'

const SRC = 'permaculture-ch'
const DE_BASE = 'https://www.permakultur.ch'
const FR_BASE = 'https://www.permaculture.ch'
const MAX_FR_DETAILS = 20

async function fromPermakulturCh(now: number): Promise<RawEvent[]> {
  const html = await getText(`${DE_BASE}/kurse`, 25000)
  if (!html) return []
  const out: RawEvent[] = []
  for (const e of extractWixEvents(html)) {
    const c = e.scheduling?.config ?? {}
    if (c.scheduleTbd || !c.startDate) continue
    const start = new Date(c.startDate)
    if (isNaN(start.getTime()) || start.getTime() < now) continue
    const loc = e.location ?? {}
    const title = String(e.title ?? '').trim()
    if (!title) continue
    if (loc.type === 1 || ONLINE_RE.test(title) || ONLINE_RE.test(loc.name ?? '')) continue
    let lat = loc.coordinates?.lat ?? loc.fullAddress?.geocode?.latitude
    let lng = loc.coordinates?.lng ?? loc.fullAddress?.geocode?.longitude
    const locName = [loc.name, loc.address].filter((s: string) => s && s.trim()).join(', ')
    if (!(typeof lat === 'number' && typeof lng === 'number') || (!lat && !lng)) {
      const g = await geocodeChFirst([loc.address ?? '', loc.name ?? ''].filter(Boolean))
      if (!g) continue
      lat = g.lat; lng = g.lng
    }
    const end = c.endDate && !c.endDateHidden ? new Date(c.endDate).toISOString() : null
    const ticketing = e.registration?.ticketing
    const price = ticketing?.lowestTicketPriceFormatted || ticketing?.lowestPrice?.formatted
    out.push({
      source: SRC,
      source_id: `perma-ch-${e.id}`,
      source_url: `${DE_BASE}/event-details/${e.slug}`,
      title,
      description: stripHtml(String(e.description || e.about || '')).slice(0, 600) || `${title} — Verein Permakultur Schweiz`,
      organizer: 'Verein Permakultur Schweiz',
      location_name: locName || 'Schweiz',
      lat, lng,
      starts_at: start.toISOString(),
      ends_at: end && end > start.toISOString() ? end : null,
      cost: price ? String(price) : 'Siehe Veranstaltung',
      image_url: e.mainImage?.url ?? null,
    })
  }
  return out
}

/** Place candidates from Permaculture Romande free text. */
function frPlaces(text: string): string[] {
  const out: string[] = []
  const cap = "([A-ZÉÈÂÎ][\\wéèêëàâîïôûüç'’-]+(?:[ -](?:sur|sous|le|la|les|de|du|des|en|[A-ZÉÈ][\\wéèêëàâîïôûüç'’-]+))*)"
  for (const re of [
    new RegExp(`(?:^|\\s)à ${cap}\\s*\\((VD|GE|FR|NE|VS|JU|BE)\\)`, 'g'),
    new RegExp(`(?:^|\\s)à ${cap},? (?:dans le )?canton`, 'g'),
    new RegExp(`\\b[Ll]ieu\\s*:\\s*${cap}`, 'g'),
    new RegExp(`^[^.]{0,120}? - ${cap}\\s`, 'g'),
    new RegExp(`\\b(\\d{4}) ${cap}`, 'g'),
  ]) {
    for (const m of text.matchAll(re)) {
      if (/^\d{4}$/.test(m[1])) out.push(`${m[1]} ${m[2]}`)
      else out.push(m[2] && /^[A-Z]{2}$/.test(m[2]) ? `${m[1]}, ${m[2]}` : m[1])
    }
  }
  return out
}

async function fromRomande(now: number): Promise<RawEvent[]> {
  const from = new Date(now).toISOString().slice(0, 10)
  const to = new Date(now + 400 * 86400000).toISOString().slice(0, 10)
  const raw = await getText(`${FR_BASE}/evenements?start=${from}&end=${to}`, 20000, 'application/json')
  if (!raw) return []
  let list: { title: string; start: string; url: string }[] = []
  try { list = JSON.parse(raw) } catch { return [] }

  // Group occurrences by event page
  const byUrl = new Map<string, { title: string; dates: string[] }>()
  for (const x of list) {
    if (!x?.url || !/^\d{4}-\d{2}-\d{2}/.test(x.start ?? '')) continue
    const g = byUrl.get(x.url) ?? { title: stripHtml(x.title ?? ''), dates: [] }
    g.dates.push(x.start.slice(0, 10))
    byUrl.set(x.url, g)
  }

  const out: RawEvent[] = []
  let details = 0
  for (const [path, g] of byUrl) {
    const future = g.dates.filter((d) => Date.parse(`${d}T23:00:00Z`) > now)
    if (!future.length || details >= MAX_FR_DETAILS) continue
    details++
    await sleep(500)
    const url = FR_BASE + path
    const html = await getText(url)
    if (!html) continue
    const body = html.match(/class="c-auto-link-target">([\s\S]*?)<h2/)?.[1] ?? ''
    const text = stripHtml(body.replace(/<\/(p|li|h\d|div)>/gi, ' . '))
    if (ONLINE_RE.test(`${g.title} ${text.slice(0, 300)}`) && !/jardin|visite|sortie/i.test(g.title)) continue
    const places = frPlaces(text)
    if (!places.length) continue
    const geo = await geocodeChFirst(places.slice(0, 3))
    if (!geo) continue
    const tm = text.match(/\b(\d{1,2})\s*h\s*(\d{2})?\s*(?:à|-|–)\s*(\d{1,2})\s*h\s*(\d{2})?/i)
    // "de 14h à 17h", "9h30 à 17h30", else a programme line "9h00: Accueil"
    const prog = tm ? null : text.match(/\b(\d{1,2})h(\d{2})\s*:/)
    const [h1, m1, h2, m2] = tm
      ? [+tm[1], +(tm[2] ?? 0), +tm[3], +(tm[4] ?? 0)]
      : prog ? [+prog[1], +prog[2], NaN, NaN] : [10, 0, NaN, NaN]
    const img = html.match(/<img alt="[^"]*" class="md-elevation-z1" src="([^"]+)"/)?.[1] ?? null
    for (const d of future) {
      const [y, mo, dd] = d.split('-').map(Number)
      const start = zurichIso(y, mo, dd, h1 < 24 ? h1 : 10, m1 < 60 ? m1 : 0)
      if (!start || Date.parse(start) < now) continue
      const end = tm && h2 < 24 && h2 > h1 ? zurichIso(y, mo, dd, h2, m2) : null
      out.push({
        source: SRC,
        source_id: `perma-ch-fr-${hashStr(path + d)}`,
        source_url: url,
        title: g.title,
        description: text.slice(0, 600),
        organizer: 'Permaculture Romande (agenda)',
        location_name: places[0],
        lat: geo.lat,
        lng: geo.lng,
        starts_at: start,
        ends_at: end,
        cost: /prix libre|participation libre/i.test(text) ? 'Prix libre' : 'Voir l’événement',
        image_url: img,
      })
    }
  }
  return out
}

export const permacultureCh: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = Date.now()
    const de = await fromPermakulturCh(now).catch(() => [] as RawEvent[])
    const fr = await fromRomande(now).catch(() => [] as RawEvent[])
    return [...de, ...fr].slice(0, 200)
  },
}
