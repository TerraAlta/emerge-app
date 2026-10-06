/**
 * Red de Huertos Urbanos Comunitarios de Madrid (REHDMAD) —
 * redhuertosurbanosmadrid.wordpress.com
 * Madrid's network of ~60 community gardens: workshops (irrigation, seeds,
 * compost, pruning), open days, agroecological markets, festivals.
 *
 * The old guessed domains (redhuertas.org, huertoscomunitarios.net) no longer
 * resolve. The network announces its activities as blog posts on a
 * WordPress.com site, read through the public WordPress.com REST API
 * (one request, last 40 posts):
 *   https://public-api.wordpress.com/rest/v1.1/sites/redhuertosurbanosmadrid.wordpress.com/posts
 * Dates are free Spanish text inside the post ("Sábado, 3 de octubre·11:00h",
 * "el domingo 4 de octubre de 2026, de 10:00 a 15:00 h"); the year is inferred
 * from the publication date. Posts that are only a poster image (no dated
 * text), meeting minutes ("ACTAS") and online meetings are skipped. Times are
 * Europe/Madrid; without a time the event is placed at 10:00. Coordinates:
 * Nominatim on the address / garden named in the post, else Madrid centre.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getJson, fold, ES_MONTHS, parseTime, spainIso, geocodeEs, ONLINE_RE } from './es-common'

const SRC = 'huertos-es'
const ORG = 'Red de Huertos Urbanos de Madrid'
const API = 'https://public-api.wordpress.com/rest/v1.1/sites/redhuertosurbanosmadrid.wordpress.com/posts?number=40&fields=ID,date,title,URL,content,categories,featured_image'
const MADRID = { lat: 40.4168, lng: -3.7038 }
const MAX_EVENTS = 200

const WEEKDAYS = 'lunes|martes|miercoles|jueves|viernes|sabado|domingo'
const MONTHS = Object.keys(ES_MONTHS).filter((k) => k.length > 3).join('|')
// "sábado, 17 de octubre (de 2026)"; weekday optional
const DATE_RE = new RegExp(`(?:\\b(${WEEKDAYS})\\b[,\\s]*(?:dia\\s+)?)?\\b(\\d{1,2})\\s+de\\s+(${MONTHS})\\b(?:\\s+de\\s+(\\d{4}))?`, 'g')

interface Hit { idx: number; weekday: boolean; d: number; mo: number; y?: number; after: string }

/** Pick the event date in a post: prefer one with a weekday ("sábado 17 de octubre"). */
function findDate(text: string): Hit | null {
  const f = fold(text)
  const hits: Hit[] = []
  for (const m of f.matchAll(DATE_RE)) {
    const before = f.slice(Math.max(0, m.index! - 25), m.index!)
    // registration deadlines etc. are not the event date
    if (/(hasta|antes|plazo|inscripci[oó]n|desde el)\s*(el\s*)?$/.test(before)) continue
    hits.push({
      idx: m.index!, weekday: !!m[1], d: +m[2], mo: ES_MONTHS[m[3]], y: m[4] ? +m[4] : undefined,
      after: f.slice(m.index! + m[0].length, m.index! + m[0].length + 80),
    })
  }
  return hits.find((h) => h.weekday) ?? hits[0] ?? null
}

/** Address or venue mentioned in the post, for geocoding. */
function venueQueries(title: string, text: string): string[] {
  const out: string[] = []
  const addr = text.match(/\b((?:C\/|calle|c\.|avda\.?|avenida|plaza|paseo|camino)\s*[^,.\n]{2,40},?\s*\d{1,4})/i)?.[1]
  if (addr) out.push(`${addr.replace(/^C\//i, 'Calle ')}, Madrid`)
  // "en el Huerto Utopía", "en la Quinta de Torre Arias", "en el CIEA de Casa de Campo"
  const venue = `${title}. ${text}`.match(/\b(?:en|EN|En)\s+(?:el|la|los|las|EL|LA)\s+((?:[Hh]uert[oa]|HUERT[OA]|[Qq]uinta|QUINTA|[Pp]arque|PARQUE|[Cc]entro [Cc]ultural|CEA|CIEA)\s+(?:(?:de|DE)\s+(?:(?:la|LA|los|las)\s+)?|del\s+|DEL\s+)?([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+(?:\s+(?:(?:de|DE)\s+)?[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+){0,3}))/)
  if (venue && !/^(urban|comunitari|escolar|madrid)/i.test(venue[2])) out.unshift(`${venue[1]}, Madrid`)
  return out
}

export const huertosEs: SourceFetcher = {
  name: SRC,
  async fetch() {
    const data = await getJson<{ posts: any[] }>(API)
    if (!data?.posts) return []

    const now = Date.now()
    const events: RawEvent[] = []
    for (const p of data.posts) {
      if (events.length >= MAX_EVENTS) break
      const cats = Object.keys(p.categories ?? {}).map((c) => c.toUpperCase())
      if (cats.some((c) => c.includes('ACTAS'))) continue
      const title = stripHtml(p.title ?? '').replace(/\s+/g, ' ').trim()
      const text = stripHtml(p.content ?? '').replace(/\s+/g, ' ').trim()
      if (!title || !text) continue
      if (ONLINE_RE.test(`${title} ${text.slice(0, 400)}`) && !/presencial/i.test(text)) continue

      const hit = findDate(`${title}. ${text}`)
      if (!hit) continue
      const pub = Date.parse(p.date)
      let y = hit.y ?? new Date(pub).getUTCFullYear()
      // year-less date before the post date → next year (Dec post about January)
      if (!hit.y && Date.UTC(y, hit.mo - 1, hit.d) < pub - 7 * 86400000) y++
      const time = parseTime(hit.after.replace(/^[\s,·.-]*(?:a las|de|desde las|en horario de)?\s*/, '')) ?? { h: 10, mi: 0 }
      const startsAt = spainIso(y, hit.mo, hit.d, time.h, time.mi)
      if (!startsAt || Date.parse(startsAt) < now + 3600_000) continue

      let geo: { lat: number; lng: number } | null = null
      let place = 'Madrid'
      for (const q of venueQueries(title, text)) {
        const g = await geocodeEs(q)
        // must be within the Madrid region
        if (g && Math.abs(g.lat - MADRID.lat) < 0.6 && Math.abs(g.lng - MADRID.lng) < 0.8) { geo = g; place = q; break }
      }
      geo ??= MADRID

      events.push({
        source: SRC,
        source_id: `hue-es-${p.ID ?? hashStr(p.URL ?? title)}`,
        source_url: p.URL ?? null,
        title,
        description: text.slice(0, 1000),
        organizer: ORG,
        location_name: place,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startsAt,
        ends_at: null,
        cost: /gratu[ií]t|entrada libre|acceso libre/i.test(text) ? 'Free' : 'Ver evento',
        image_url: p.featured_image || null,
      })
    }
    return events
  },
}
