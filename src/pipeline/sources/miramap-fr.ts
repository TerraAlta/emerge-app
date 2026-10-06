/**
 * MIRAMAP — "AMAP en Fêtes" (amap-en-fetes.org), the national programme of
 * local AMAP events coordinated by MIRAMAP with the AuRA, Île-de-France and
 * Provence AMAP networks (2026 edition: 12 Sept – 12 Nov, the AMAPs' 25th
 * anniversary; the site is reused each autumn).
 *
 * MIRAMAP's own agenda (miramap.org/evenements, Sugar Calendar) only lists
 * online webinar cycles, so it is not used. amap-fr reads the Île-de-France
 * network's agenda, so the two sources don't overlap.
 *
 * The homepage map embeds every upcoming event as an ACF marker:
 *   <div class="marker" data-lat="47.25" data-lng="-0.58">
 *     <h3><a href="…">Title</a></h3>
 *     <p class="event_date">Le 11/10 de 09:00 à 15:30</p>   (or "Du 22/09 au 06/11 de …")
 *     <p class="event_type"><a …>Visite de ferme</a> - </p>
 *     <div class="event_resume"><p>…</p></div>
 * Each event's page is then read (≤38 requests) for its address, audience
 * (members-only "Interne à l'AMAP" events are skipped), text and organiser.
 * Coordinates come from the markers. Dates have no year: we use
 * the current year, rolled forward if that would put the date > 6 months in
 * the past. Times are Europe/Paris; an end time before the start is ignored.
 */
import * as cheerio from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, parisIso, ONLINE_RE } from './fr-common'

const SRC = 'miramap-fr'
const BASE = 'https://amap-en-fetes.org/'
const MAX_EVENTS = 200
const MAX_DETAIL = 38 // + 1 homepage request

function inferYear(day: number, month: number): number {
  const now = new Date()
  let y = now.getUTCFullYear()
  const t = Date.UTC(y, month - 1, day)
  if (t < now.getTime() - 182 * 86400000) y += 1
  return y
}

interface Parsed { start: string; end: string | null }

/** "Le 11/10 de 09:00 à 15:30" / "Du 22/09 au 06/11 de 18:00 à 20:00" */
function parseWhen(s: string): Parsed | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?:\s+au\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?)?(?:\s+de\s+(\d{1,2})[:h](\d{2})(?:\s+[àa]\s+(\d{1,2})[:h](\d{2}))?)?/i)
  if (!m) return null
  const d1 = +m[1], mo1 = +m[2]
  const y1 = m[3] ? +m[3] : inferYear(d1, mo1)
  const start = parisIso(y1, mo1, d1, m[7] ? +m[7] : 0, m[8] ? +m[8] : 0)
  if (!start) return null
  let end: string | null = null
  if (m[4]) {
    const d2 = +m[4], mo2 = +m[5]
    const y2 = m[6] ? +m[6] : (mo2 < mo1 ? y1 + 1 : y1)
    end = parisIso(y2, mo2, d2, m[9] ? +m[9] : 23, m[10] ? +m[10] : 0)
  } else if (m[9]) {
    end = parisIso(y1, mo1, d1, +m[9], +m[10])
  }
  if (end && end <= start) end = null
  return { start, end }
}

export const miramapFr: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(BASE)
    if (!html) {
      console.warn('[miramap-fr] amap-en-fetes.org unavailable')
      return []
    }
    const $ = cheerio.load(html)
    const now = Date.now()
    const events: RawEvent[] = []
    const seen = new Set<string>()
    let detailFetches = 0

    for (const node of $('.marker[data-lat][data-lng]').toArray()) {
      if (events.length >= MAX_EVENTS) break
      const el = $(node)
      const lat = parseFloat(el.attr('data-lat') ?? '')
      const lng = parseFloat(el.attr('data-lng') ?? '')
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue
      if (lat < 41 || lat > 51.6 || lng < -5.6 || lng > 9.7) continue

      const a = el.find('h3 a').first()
      const title = a.text().replace(/\s+/g, ' ').trim()
      const link = a.attr('href') ?? ''
      if (!title || !link || seen.has(link)) continue
      const when = parseWhen(el.find('.event_date').first().text())
      if (!when || new Date(when.start).getTime() < now) continue
      const type = el.find('.event_type a').first().text().trim()
      const resume = stripHtml((el.find('.event_resume').first().html() ?? '').replace(/<[^>]+>/g, ' '))
      if (ONLINE_RE.test(`${title} ${resume}`)) continue
      seen.add(link)

      // Detail page: address, audience ("Interne à l'AMAP" = members only → skip),
      // full text and organiser. Marker data is the fallback.
      let place = ''
      let descr = resume
      let organizer = ''
      if (detailFetches < MAX_DETAIL) {
        detailFetches++
        const dh = await getText(link)
        if (dh) {
          const d$ = cheerio.load(dh)
          const audience = d$('.pour-qui p').first().text().trim()
          if (/interne|adh[ée]rent/i.test(audience)) continue
          place = d$('.event-location').first().text().replace(/\s+/g, ' ').trim()
          const body = stripHtml((d$('.entry-content').first().html() ?? '').replace(/<[^>]+>/g, ' '))
          if (body) descr = body
          organizer = d$('.event-organisator > div').first().text().replace(/\s+/g, ' ').trim()
          if (ONLINE_RE.test(`${place} ${body}`) && !place) continue
        }
        await new Promise((r) => setTimeout(r, 300))
      }
      // Town hint from the title: "… – la Ciotat – 13", "(Trélazé 49)", "Sombernon 21"
      const dept = title.match(/\((?:[^()]*\s)?(\d{2})\)|[-–]\s*(\d{2})\s*$/)
      events.push({
        source: SRC,
        source_id: `amapenfetes-${hashStr(link)}`,
        source_url: link,
        title,
        description: [type, descr].filter(Boolean).join(' — ').slice(0, 500) || title,
        organizer: (organizer || 'AMAP en Fêtes — MIRAMAP & réseaux AMAP').slice(0, 150),
        location_name: (place || (dept ? `AMAP en Fêtes (${dept[1] ?? dept[2]})` : 'AMAP en Fêtes')).slice(0, 200),
        lat,
        lng,
        starts_at: when.start,
        ends_at: when.end,
        cost: 'Voir l’événement',
      })
    }
    return events
  },
}
