/**
 * Asociación de Agricultura Regenerativa Ibérica — agriculturaregenerativa.es
 * Regenerative agriculture courses, field days and congresses across Spain
 * (plus a few abroad), curated by the association.
 *
 * The whole agenda (~15 entries) is one Elementor page:
 *   https://www.agriculturaregenerativa.es/formacion-eventos/
 * (backed by the `agenda` custom post type, whose REST endpoint exposes no
 * date/place fields — so the rendered page is the structured source).
 * Each card is a sequence of shortcode widgets:
 *   <p class="provincia">🌍 Burgos</p>            province / country
 *   <h2 class="elementor-heading-title">Title</h2>
 *   <h3 class="subtitulo-evento">Curso presencial</h3>
 *   <p class="fecha-evento">📅 17 y 18 de octubre 2026</p>
 *   <div class="descripcion-evento">…</div>
 *   🏢 Organiza: …  🗣️ speakers  📍 town  🏡 venue  💰 price
 *   <a class="btn-web" href="…">Más información e inscripción</a>
 * Dates are free Spanish text ("6 de octubre al 12 de noviembre 2026",
 * "22 al 24 de octubre"); a "Horario: de 10:00 a 18:00" line gives the start
 * time, else 10:00 local. Entries with only an end date ("Fecha de
 * finalización: …") and online-only ones are skipped. Coordinates come from
 * Nominatim (town + province); entries outside Spain are geocoded globally.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, parseEsRange, parseTime, spainIso, tzFor, geocodeEsFirst, isSpanishRegion, ONLINE_RE } from './es-common'

const SRC = 'agri-regen-es'
const ORG = 'Asociación de Agricultura Regenerativa Ibérica'
const URL = 'https://www.agriculturaregenerativa.es/formacion-eventos/'
const MAX_EVENTS = 200

/** Text of the first shortcode paragraph/div starting with an emoji marker. */
function field(block: string, emoji: string): string {
  const i = block.indexOf(emoji)
  if (i < 0) return ''
  const rest = block.slice(i + emoji.length)
  return stripHtml(rest.split(/<\/(?:p|div)>/)[0]).replace(/^\uFE0F/, '').trim()
}

export const agriRegenEs: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(URL)
    if (!html) return []

    const now = Date.now()
    const seen = new Set<string>()
    const events: RawEvent[] = []
    const blocks = html.split(/<p class="provincia">/).slice(1)

    for (const raw of blocks) {
      if (events.length >= MAX_EVENTS) break
      // Card ends at the divider before the next card
      const block = raw.split(/elementor-widget-divider/)[0]
      const province = stripHtml(block.match(/^([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/^🌍\s*/u, '').trim()
      const title = stripHtml(block.match(/<h2 class="elementor-heading-title[^"]*">([\s\S]*?)<\/h2>/)?.[1] ?? '')
      const dateText = stripHtml(block.match(/class="fecha-evento">([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/^📅\s*/u, '')
      if (!title || !dateText) continue
      if (/finalizaci[oó]n|hasta el/i.test(dateText)) continue // only an end/deadline date

      const subtitle = stripHtml(block.match(/class="subtitulo-evento">([\s\S]*?)<\/h3>/)?.[1] ?? '')
      if (ONLINE_RE.test(`${title} ${subtitle}`) && !/presencial/i.test(`${title} ${subtitle}`)) continue

      const range = parseEsRange(dateText, new Date(now))
      if (!range) continue
      const descHtml = block.match(/class="descripcion-evento">([\s\S]*?)<\/div><\/div>/)?.[1] ?? ''
      const description = stripHtml(descHtml).replace(/\s+/g, ' ').trim()
      const horario = stripHtml(block).match(/Horario\s*:?\s*(?:de\s*)?([^\n]{0,40})/i)?.[1] ?? ''
      const time = parseTime(horario) ?? { h: 10, mi: 0 }

      const town = field(block, '📍')
      const venue = field(block, '🏡')
      const organizer = field(block, '🏢').replace(/^Organiza(?:n|ci[oó]n|do por)?\s*:?\s*/i, '') || ORG
      const costRaw = field(block, '💰')
      const cost = costRaw && !/^x+$/i.test(costRaw) ? costRaw : 'Ver evento'
      const link = block.match(/<a class="btn-web"[^>]*href="([^"]+)"/)?.[1]
      const image = block.match(/data-src="([^"]+\.(?:jpe?g|png|webp))"/i)?.[1] ?? null

      const spanish = isSpanishRegion(province) || !province
      // "San José del Valle y Morón de la Frontera" / "Cádiz y Sevilla" → first place
      const first = (v: string) => v.split(/\s+(?:y|i|e)\s+|\s*[,/(]\s*/)[0].trim()
      const queries = [
        town && province ? `${town}, ${province}` : '',
        town && province ? `${first(town)}, ${first(province)}` : '',
        town && spanish ? first(town) : '',
        first(province),
      ].filter(Boolean)
      const geo = await geocodeEsFirst(queries, !spanish)
      if (!geo) continue

      const tz = tzFor(geo.lat, geo.lng)
      const { start, end } = range
      const startsAt = spainIso(start.y, start.mo, start.d, time.h, time.mi, tz)
      if (!startsAt || Date.parse(startsAt) < now + 3600_000) continue
      const endsAt = end ? spainIso(end.y, end.mo, end.d, 18, 0, tz) : null

      const id = `aregen-${hashStr(`${title}|${start.y}-${start.mo}-${start.d}`)}`
      if (seen.has(id)) continue
      seen.add(id)

      const place = [venue, town, province].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ')
      events.push({
        source: SRC,
        source_id: id,
        source_url: link ? link.replace(/&#0?38;|&amp;/g, '&') : URL,
        title,
        description: [subtitle, description].filter(Boolean).join(' — ').slice(0, 1000),
        organizer,
        location_name: place || 'España',
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
