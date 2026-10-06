/**
 * ZEGG — zegg.de
 * Intentional community and education centre in Bad Belzig, Brandenburg
 * (~120 residents). Seminars, festivals, community weeks, trainings.
 *
 * The whole programme (~15 months, ~170 entries) is one Joomla page:
 *   https://www.zegg.de/de/veranstaltungen/programm
 * Every entry is a schema.org/Event microdata block:
 *   <div class="sd-event ..." itemscope itemtype="https://schema.org/Event"
 *        data-labels="..." data-searchable-text="title + description">
 *     <a href="/de/veranstaltungen/programm/<id>/<slug>" class="... is-canceled?">
 *       <time itemprop="startDate" datetime="2026-10-07T19:30:00+02:00">
 *       <time itemprop="endDate"   datetime="2026-10-11T13:00:00+02:00">
 *       <h4 itemprop="name">…</h4><p>subtitle</p>
 *       <div itemprop="organizer">facilitators</div>
 *       <div class="sd-event-registration">Plätze frei / Ausgebucht / …</div>
 *       <div itemprop="location"> … Bad Belzig …</div>
 * Datetimes carry their UTC offset, so no timezone guessing is needed.
 * Cancelled entries and online formats are skipped. All events take place at
 * the ZEGG campus (Rosa-Luxemburg-Str. 89, Bad Belzig) — fixed coordinates.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities } from './utils'

const SRC = 'zegg-de'
const BASE = 'https://www.zegg.de'
const URL = `${BASE}/de/veranstaltungen/programm`
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const LAT = 52.1568, LNG = 12.5906 // ZEGG campus, Bad Belzig (OSM)
const MAX_EVENTS = 200

function attr(block: string, name: string): string {
  return block.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? ''
}

export const zeggDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    let html: string
    try {
      const res = await fetch(URL, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) return []
      html = await res.text()
    } catch {
      return []
    }

    const now = Date.now()
    const seen = new Set<string>()
    const events: RawEvent[] = []
    const blocks = html.split(/<div class="sd-event(?:\s[^"]*)?"/).slice(1)

    for (const raw of blocks) {
      const block = raw.split(/<div class="sd-month\b/)[0]
      const start = block.match(/itemprop="startDate"[^>]*datetime="([^"]+)"/)?.[1]
      const end = block.match(/itemprop="endDate"[^>]*datetime="([^"]+)"/)?.[1]
      const title = stripHtml(block.match(/itemprop="name">([\s\S]*?)<\/h4>/)?.[1] ?? '')
      if (!start || !title) continue
      const startMs = Date.parse(start)
      if (!Number.isFinite(startMs) || startMs < now + 3600_000) continue
      const endMs = end ? Date.parse(end) : NaN

      const aTag = block.match(/<a\b[^>]*>/)?.[0] ?? ''
      const cls = attr(aTag, 'class')
      if (/is-canceled/.test(cls)) continue
      const href = attr(aTag, 'href')
      const subtitle = stripHtml(block.match(/<\/h4>\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? '')
      if (/\b(online|webinar|zoom|livestream|digital)\b/i.test(`${title} ${subtitle}`)) continue

      const facilitators = stripHtml(block.match(/itemprop="organizer">([\s\S]*?)<\/div>/)?.[1] ?? '')
      const status = stripHtml((block.match(/class="sd-event-registration">([\s\S]*?)<\/div>/)?.[1] ?? '').replace(/<!--[\s\S]*?-->/g, ''))
      if (/abgesagt|entf[äa]llt/i.test(status)) continue
      const labels = decodeEntities(attr(block, 'data-labels'))
      // data-searchable-text = title + subtitle + facilitators + description (double-encoded)
      let desc = stripHtml(decodeEntities(attr(block, 'data-searchable-text'))).replace(/\u00ad/g, "")
      if (desc.startsWith(title)) desc = desc.slice(title.length).trim()
      if (subtitle && desc.startsWith(subtitle)) desc = desc.slice(subtitle.length).trim()
      if (desc.length > 700) desc = desc.slice(0, 700).replace(/\s+\S*$/, '') + ' …'

      const url = href ? new globalThis.URL(href, BASE).toString() : URL
      const key = `${href || title}|${start}`
      if (seen.has(key)) continue
      seen.add(key)

      events.push({
        source: SRC,
        source_id: `zegg-${(href.match(/programm\/([0-9a-f]{16,})/)?.[1] ?? title).slice(0, 40)}-${start.slice(0, 10)}`,
        source_url: url,
        title: subtitle ? `${title} — ${subtitle}` : title,
        description: [
          desc || subtitle,
          facilitators ? `Mit ${facilitators}.` : '',
          labels ? `Themen: ${labels}.` : '',
          status ? `Status: ${status}.` : '',
          /external-event/.test(cls) ? 'Gastveranstaltung im ZEGG.' : '',
        ].filter(Boolean).join(' '),
        organizer: /external-event/.test(cls) && facilitators ? `${facilitators} (im ZEGG)` : 'ZEGG Bildungszentrum',
        location_name: 'ZEGG, Rosa-Luxemburg-Str. 89, 14806 Bad Belzig',
        lat: LAT,
        lng: LNG,
        starts_at: new Date(startMs).toISOString(),
        ends_at: Number.isFinite(endMs) && endMs > startMs ? new Date(endMs).toISOString() : null,
        cost: 'Siehe Seminarseite',
      })
    }

    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return events.slice(0, MAX_EVENTS)
  },
}
