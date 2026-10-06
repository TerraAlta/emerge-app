/**
 * REAS Red de Redes de Economía Alternativa y Solidaria — economiasolidaria.org
 * Spain's social & solidarity economy network: fairs, encounters, courses and
 * assemblies of its regional networks (XES, REAS Euskadi, Mercado Social…).
 *
 * The old reas.es domain now hosts a gambling SEO page; REAS publishes its
 * agenda on its portal economiasolidaria.org:
 *   https://www.economiasolidaria.org/agenda-de-actividades/
 * lists the upcoming activities ("En portada", "Destacamos", "Próximas
 * actividades"), linking to /actividades/<slug>/. The `actividades` REST type
 * carries no date fields, so each detail page is read (≤ ~20 requests):
 *   <h1>Title</h1>
 *   <div class="primer_grupo"><h4>territory links</h4>
 *   <div class="fecha_evento_individual">17 de octubre 10:30 al 18 de octubre 16:00</div>
 *   <div class="lugar_evento_individual">Parc de l'Estació del Nord, Barcelona</div>
 *   <li><strong>Organiza: </strong>…</li>  <li><strong>Más info en:</strong> <a href>…
 *   <div class="texto_evento_individual">description</div>
 * Dates carry no year: it is inferred as the next occurrence (the agenda only
 * lists upcoming activities). Times are Europe/Madrid; no time → 10:00.
 * Online activities (webinars, online fora) are skipped. Coordinates come from
 * Nominatim on the venue text, falling back to the tagged territory.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, haversine } from './utils'
import { getText, parseEsRange, parseTime, spainIso, tzFor, geocodeEs, geocodeEsFirst, ONLINE_RE } from './es-common'

const SRC = 'reas-es'
const ORG = 'REAS Red de Redes'
const BASE = 'https://www.economiasolidaria.org'
const AGENDA = `${BASE}/agenda-de-actividades/`
const MAX_DETAILS = 25
const MAX_EVENTS = 200

function cls(html: string, name: string): string {
  return html.match(new RegExp(`class="${name}">([\\s\\S]*?)</div>`))?.[1] ?? ''
}

export const reasEs: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(AGENDA)
    if (!html) return []
    const body = html.slice(html.indexOf('cuerpo_agenda'), html.indexOf('Ver actividades pasadas') > 0 ? html.indexOf('Ver actividades pasadas') : undefined)
    const links = [...new Set(
      [...body.matchAll(/href=['"](https:\/\/www\.economiasolidaria\.org\/actividades\/[^'"#?]+\/)['"]/g)].map((m) => m[1]),
    )].slice(0, MAX_DETAILS)

    const now = Date.now()
    const events: RawEvent[] = []
    for (const url of links) {
      if (events.length >= MAX_EVENTS) break
      const page = await getText(url)
      if (!page) continue
      const title = stripHtml(page.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? '')
      const fecha = stripHtml(cls(page, 'fecha_evento_individual')).replace(/\s+/g, ' ').trim()
      if (!title || !fecha) continue
      const lugar = stripHtml(cls(page, 'lugar_evento_individual')).replace(/\s+/g, ' ').trim()
      const territory = stripHtml(page.match(/<div class="primer_grupo">\s*<h4>([\s\S]*?)<\/h4>/)?.[1] ?? '')
      const text = stripHtml(cls(page, 'texto_evento_individual')).replace(/\s+/g, ' ').trim()
      const tags = [...page.matchAll(/economiasolidaria\.org\/tag\/([a-z0-9-]+)\//g)].map((m) => m[1])
      const modalidad = text.match(/Modalidad\s*:\s*([^.]{0,40})/i)?.[1] ?? ''
      if (ONLINE_RE.test(`${title} ${lugar} ${modalidad}`) && !/presencial/i.test(`${lugar} ${modalidad}`)) continue
      if ((tags.includes('online') || tags.includes('webinar')) && !/presencial/i.test(`${title} ${lugar} ${modalidad}`)) continue

      const range = parseEsRange(fecha, new Date(now), 45)
      if (!range) continue
      const [startPart, endPart = ''] = fecha.split(/\s+al\s+/)
      const t0 = parseTime(startPart) ?? { h: 10, mi: 0 }
      const t1 = parseTime(endPart)

      const terrParts = territory.split(',').map((s) => s.trim()).filter((s) => s && !/estado espa/i.test(s))
      if (!lugar && !terrParts.length) continue
      // "Ateneu X, Recinto Y de Sant Andreu (Barcelona)" → try the full text, then
      // shorter comma-suffixes, then the town in brackets, then the territory.
      const norm = lugar.split(/\s+y\s+/)[0].replace(/\s*\(([^)]+)\)/g, ', $1').replace(/\s+/g, ' ').trim()
      const parts = norm.split(',').map((x) => x.trim()).filter(Boolean)
      const queries = [
        lugar,
        lugar.replace(/\s*\(([^)]+)\)/g, ', $1'),
        ...parts.map((_, i) => parts.slice(i).join(', ')),
        ...[...lugar.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]),
        ...terrParts,
      ].filter((q, i, a) => q && a.indexOf(q) === i)
      // Anchor on the tagged territory and reject venue matches far away from
      // it (Nominatim's fuzzy street matches can land in another province).
      const anchor = terrParts.length ? await geocodeEsFirst(terrParts) : null
      let geo: { lat: number; lng: number } | null = null
      for (const q of queries) {
        const g = await geocodeEs(q)
        if (g && (!anchor || haversine(g.lat, g.lng, anchor.lat, anchor.lng) <= 200)) { geo = g; break }
      }
      geo ??= anchor
      if (!geo) continue
      const tz = tzFor(geo.lat, geo.lng)

      const { start, end } = range
      const startsAt = spainIso(start.y, start.mo, start.d, t0.h, t0.mi, tz)
      if (!startsAt || Date.parse(startsAt) < now + 3600_000) continue
      const e = end ?? start
      let endsAt: string | null = null
      if (t1) endsAt = spainIso(e.y, e.mo, e.d, t1.h, t1.mi, tz)
      else if (end) endsAt = spainIso(e.y, e.mo, e.d, 18, 0, tz)
      if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = null

      const organizer = stripHtml(page.match(/<strong>Organiza:\s*<\/strong>([\s\S]*?)<\/li>/)?.[1] ?? '').trim() || ORG
      const image = page.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null
      const slug = url.replace(/\/$/, '').split('/').pop()!
      const cost = /gratu[ií]t|entrada libre|acceso libre|lliure/i.test(text) ? 'Free' : 'Ver evento'

      events.push({
        source: SRC,
        source_id: `reas-${hashStr(slug)}`,
        source_url: url,
        title,
        description: text.slice(0, 1000),
        organizer,
        location_name: [lugar, terrParts.join(', ')].filter(Boolean).join(' — ') || 'España',
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startsAt,
        ends_at: endsAt,
        cost,
        image_url: image,
      })
    }
    return events
  },
}
