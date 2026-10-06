/**
 * Schnippeldisko (Disco Soup) Germany — community cooking with rescued
 * vegetables and music, run by Slow Food Youth Deutschland and local
 * Slow Food groups.
 *
 * The old schnippeldisko.de domain is dead ("no Host found"). The events are
 * now published in Slow Food Deutschland's calendar (Plone), whose REST API
 * is public:
 *   https://www.slowfood.de/@search?portal_type=slwf.website.event
 *     &SearchableText=Schnippeldisko&end.query=<now>&end.range=min
 *     &metadata_fields=_all
 * start/end are real UTC; each event carries geolocation, city and postcode.
 * We keep events whose title mentions Schnippeldisko / Disco Soup.
 * One or two requests.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'schnippeldisko-de'
const API = 'https://www.slowfood.de/@search'
const UA = 'Emerge-App/1.0 (https://emerge.terralta.org)'
const TERMS = ['Schnippeldisko', 'Disco Soup']
const TITLE_RX = /schnippel\s*-?\s*disko|disco\s*-?\s*soup/i

export const schnippeldiskoDe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const nowIso = new Date().toISOString().slice(0, 19) + 'Z'
    const out: RawEvent[] = []
    const seen = new Set<string>()

    for (const term of TERMS) {
      const qs = new URLSearchParams({
        portal_type: 'slwf.website.event',
        SearchableText: term,
        'end.query': nowIso,
        'end.range': 'min',
        sort_on: 'start',
        b_size: '100',
        metadata_fields: '_all',
      })
      let data: any
      try {
        const res = await fetch(`${API}?${qs}`, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(20000),
        })
        if (!res.ok) {
          console.warn(`[${SRC}] HTTP ${res.status}`)
          continue
        }
        data = await res.json()
      } catch (err) {
        console.warn(`[${SRC}] search failed:`, (err as Error).message)
        continue
      }

      for (const it of Array.isArray(data?.items) ? data.items : []) {
        const title = stripHtml(String(it.title ?? it.Title ?? '')).trim()
        if (!title || !TITLE_RX.test(title)) continue
        if (/abgesagt|cancel/i.test(title)) continue
        if (/\bonline\b|webinar|zoom/i.test(title)) continue
        const uid = String(it.UID ?? it['@id'] ?? '')
        if (!uid || seen.has(uid)) continue

        const start = Date.parse(it.start ?? '')
        if (!Number.isFinite(start)) continue
        const end = Date.parse(it.end ?? '')

        const lat = Number(it.latitude ?? it.geolocation?.[0])
        const lng = Number(it.longitude ?? it.geolocation?.[1])
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue
        // Groups sometimes publish the same event twice (different UIDs)
        const twin = `${title.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()}|${start}`
        if (seen.has(twin)) continue
        seen.add(uid)
        seen.add(twin)

        const city = (Array.isArray(it.city) ? it.city : [it.city]).filter(Boolean).join(', ')
        const location = [it.location, [it.postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ')

        out.push({
          source: SRC,
          source_id: `sd-sf-${uid}`,
          source_url: it['@id'] ?? it.getURL ?? 'https://www.slowfood.de/kalender',
          title,
          description:
            stripHtml(String(it.description ?? it.Description ?? '')).slice(0, 1500) ||
            'Schnippeldisko: gemeinsam gerettetes Gemüse schnippeln und kochen, mit Musik — gegen Lebensmittelverschwendung.',
          organizer: 'Slow Food Deutschland / Slow Food Youth',
          location_name: location || 'Deutschland',
          lat,
          lng,
          starts_at: new Date(start).toISOString(),
          ends_at: Number.isFinite(end) && end > start ? new Date(end).toISOString() : null,
          cost: 'Free',
        })
      }
    }
    return out
  },
}
