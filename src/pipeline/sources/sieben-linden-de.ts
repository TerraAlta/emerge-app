/**
 * Ökodorf Sieben Linden — Germany's best-known ecovillage (Beetzendorf, Altmark).
 * Seminars, Mitarbeitswochen (volunteer weeks), info weekends, Sonntagscafé…
 *
 * The seminar programme ("Lernort", https://lernort.siebenlinden.org) is a
 * SeminarDesk booking site. Its public JSON API lists every upcoming date:
 *   https://siebenlinden.seminardesk.de/api/eventDates
 * beginDate/endDate are epoch milliseconds (true UTC). attendanceType is
 * ON_SITE or ONLINE — online dates are skipped. The API gives no venue, as
 * everything happens in the village, so we use its fixed coordinates.
 * One request.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'sieben-linden-de'
const API = 'https://siebenlinden.seminardesk.de/api/eventDates'
const SITE = 'https://lernort.siebenlinden.org/de'
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const MAX_EVENTS = 200

// Ökodorf Sieben Linden, 38489 Beetzendorf (OSM place node)
const SL_LAT = 52.6891
const SL_LNG = 11.1436
const SL_NAME = 'Ökodorf Sieben Linden, Sieben Linden 1, 38489 Beetzendorf'

type Loc = { language?: string; value?: string }[] | null | undefined

/** Pick the German (else first non-empty) value of a SeminarDesk localized field. */
function loc(v: Loc): string {
  if (!Array.isArray(v)) return ''
  const de = v.find((x) => x.language?.toUpperCase() === 'DE' && x.value?.trim())
  return (de ?? v.find((x) => x.value?.trim()))?.value?.trim() ?? ''
}

export const siebenLindenDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    let data: any
    try {
      const res = await fetch(API, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) {
        console.warn(`[${SRC}] API HTTP ${res.status}`)
        return []
      }
      data = await res.json()
    } catch (err) {
      console.warn(`[${SRC}] API failed:`, (err as Error).message)
      return []
    }

    const dates: any[] = Array.isArray(data?.dates) ? data.dates : []
    const out: RawEvent[] = []
    const seen = new Set<string>()

    for (const d of dates) {
      if (out.length >= MAX_EVENTS) break
      if (d?.attendanceType && d.attendanceType !== 'ON_SITE') continue
      if (d?.status && /cancel|abgesagt/i.test(String(d.status))) continue
      const begin = Number(d?.beginDate)
      if (!Number.isFinite(begin) || begin <= 0) continue
      const end = Number(d?.endDate)

      const info = d.eventInfo ?? {}
      const title = stripHtml(loc(d.title) || loc(info.title)).trim()
      if (!title) continue
      const dateTitle = stripHtml(loc(d.eventDateTitle)).trim()
      if (/online|webinar|zoom/i.test(`${title} ${dateTitle}`) && !/präsenz|vor ort/i.test(title)) continue

      const id = `sl-${d.id ?? `${info.id}-${begin}`}`
      if (seen.has(id)) continue
      seen.add(id)

      const subtitle = stripHtml(loc(info.subtitle))
      const teaser = stripHtml(loc(info.teaser))
      const body = stripHtml(loc(info.description))
      const facilitators = (Array.isArray(d.facilitators) ? d.facilitators : [])
        .map((f: any) => String(f?.name ?? '').trim())
        .filter(Boolean)
      const description = [subtitle, teaser || body, facilitators.length ? `Mit ${facilitators.join(', ')}.` : '']
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 1500)

      const slug = loc(info.titleSlug)
      const price = stripHtml(loc(d.priceInfo)).trim()

      out.push({
        source: SRC,
        source_id: id,
        source_url: info.id ? `${SITE}/${info.id}${slug ? `/${slug}` : ''}` : SITE,
        title: dateTitle && dateTitle !== title ? `${title} — ${dateTitle}` : title,
        description: description || 'Seminar im Ökodorf Sieben Linden.',
        organizer: 'Ökodorf Sieben Linden',
        location_name: SL_NAME,
        lat: SL_LAT,
        lng: SL_LNG,
        starts_at: new Date(begin).toISOString(),
        ends_at: Number.isFinite(end) && end > begin ? new Date(end).toISOString() : null,
        cost: price ? (/^0\s*€$/.test(price) ? 'Free' : price.slice(0, 120)) : 'See event page',
        image_url: loc(info.teaserPictureUrl) ? encodeURI(loc(info.teaserPictureUrl)) : null,
      })
    }
    return out
  },
}
