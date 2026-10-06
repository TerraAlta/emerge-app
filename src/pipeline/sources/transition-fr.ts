/**
 * Réseau Transition — reseautransition.be (Transition network, Wallonia &
 * Brussels; also lists cross-border events such as the international
 * Transition meeting in Mouscron).
 *
 * The site runs WordPress + Events Manager, which publishes an iCalendar
 * feed of upcoming events at /events.ics (TZID=Europe/Brussels, same
 * CET/CEST rules as Paris). One request. The feed's X-APPLE geo is always
 * 0,0, so LOCATION ("Venue, street, town, province, postcode, Belgique") is
 * geocoded (cached). Online events are skipped.
 *
 * entransition.fr (Transition France) has no structured agenda — its
 * "agenda" is a handful of blog posts that relay the same events — so it is
 * not read.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, parseIcs, geocodeFrFirst, ONLINE_RE } from './fr-common'

const SRC = 'transition-fr'
const FEED = 'https://www.reseautransition.be/events.ics'
const AGENDA = 'https://www.reseautransition.be/agenda/'
const MAX_EVENTS = 200

export const transitionFr: SourceFetcher = {
  name: SRC,
  async fetch() {
    const ics = await getText(FEED)
    if (!ics || !ics.includes('BEGIN:VCALENDAR')) {
      console.warn('[transition-fr] events.ics unavailable')
      return []
    }
    const now = Date.now()
    const events: RawEvent[] = []
    for (const ev of parseIcs(ics)) {
      if (events.length >= MAX_EVENTS) break
      if (ev.status === 'CANCELLED' || new Date(ev.start).getTime() < now) continue
      if (!ev.location || ONLINE_RE.test(`${ev.summary} ${ev.location}`)) continue

      // "Hulplanche, Rue de Rhisnes 82, Émines, Province de Namur, 5080, Belgique"
      const parts = ev.location.split(',').map((s) => s.trim())
        .filter((s) => s && !/^(belgique|belgium|france)$/i.test(s) && !/^province\b/i.test(s))
      const postcode = parts.find((p) => /^\d{4,5}$/.test(p)) ?? ''
      const noPc = parts.filter((p) => p !== postcode)
      const town = noPc[noPc.length - 1] ?? ''
      const geo = await geocodeFrFirst([
        noPc.slice(1).join(', ') + (postcode ? ` ${postcode}` : ''),
        `${postcode} ${town}`.trim(),
        town,
      ].filter(Boolean))
      if (!geo) continue

      const idm = ev.uid.match(/^(\d+)@/)
      events.push({
        source: SRC,
        source_id: `transition-be-${idm ? idm[1] : ev.uid}`,
        source_url: ev.url || AGENDA,
        title: ev.summary,
        description: (stripHtml(ev.description) || ev.summary).slice(0, 500),
        organizer: 'Réseau Transition',
        location_name: parts.join(', ').slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: ev.start,
        ends_at: ev.end,
        cost: 'Voir l’événement',
      })
    }
    return events
  },
}
