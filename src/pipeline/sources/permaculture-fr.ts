/**
 * Réseau français de permaculture — Brin de Paille (brindepaille.permaculture.fr)
 *
 * permaculture.fr is now a static portal pointing to the association Brin de
 * Paille, whose "Agenda" page (/agenda-carte/) embeds a Google Calendar
 * combining the network's public calendars. Each one has a public iCal feed:
 *   https://calendar.google.com/calendar/ical/<id>%40group.calendar.google.com/public/basic.ics
 *   - 7p7itav5ple7iof5uje600mf7g  "Réseau PMC" (courses/events by member orgs)
 *   - kgqc39d66ph8l935stmv6b1dqg  "Formations PMC" (permaculture design courses)
 *   - 36i7lisbrp38sbed69268opblg  "Formations thématiques"
 *   - 7dirnbkjmcvpormn8ai4kojc94  "Chantiers participatifs"
 * (a fifth id in the embed returns 404). Four requests. Times are UTC ("Z")
 * or Europe/Paris; all-day events start at 00:00 Paris. Recurring masters
 * (RRULE) are skipped — the feeds use explicit dated entries. Online events
 * are skipped; LOCATION is geocoded (cached). bfrp.org (the old URL) is now a
 * placeholder site unrelated to permaculture.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, parseIcs, geocodeFrFirst, ONLINE_RE } from './fr-common'

const SRC = 'permaculture-fr'
const AGENDA = 'https://brindepaille.permaculture.fr/agenda-carte/'
const CALENDARS: Array<[string, string]> = [
  ['7p7itav5ple7iof5uje600mf7g', 'Réseau PMC'],
  ['kgqc39d66ph8l935stmv6b1dqg', 'Formations PMC'],
  ['36i7lisbrp38sbed69268opblg', 'Formations thématiques'],
  ['7dirnbkjmcvpormn8ai4kojc94', 'Chantiers participatifs'],
]
const MAX_EVENTS = 200

function firstLink(html: string): string | null {
  const m = html.match(/https?:\/\/[^\s"'<>]+/g) ?? []
  const u = m.find((x) => !/google\.com|goo\.gl|gstatic/.test(x))
  return u ? u.replace(/[).,;]+$/, '') : null
}

export const permacultureFr: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = Date.now()
    const events: RawEvent[] = []
    const seen = new Set<string>()

    for (const [id, calName] of CALENDARS) {
      const ics = await getText(`https://calendar.google.com/calendar/ical/${id}%40group.calendar.google.com/public/basic.ics`)
      if (!ics || !ics.includes('BEGIN:VCALENDAR')) continue
      const upcoming = parseIcs(ics)
        .filter((e) => !e.rrule && e.status !== 'CANCELLED' && new Date(e.start).getTime() > now)
        .sort((a, b) => a.start.localeCompare(b.start))

      for (const ev of upcoming) {
        if (events.length >= MAX_EVENTS) break
        const key = `${ev.summary}|${ev.start}`
        if (seen.has(ev.uid) || seen.has(key)) continue
        seen.add(ev.uid)
        seen.add(key)
        if (!ev.location || ONLINE_RE.test(`${ev.summary} ${ev.location}`)) continue

        // "Céret, 66400 Céret, France" / "Ferme X, 12 chemin Y, 34120 Tourbes, France"
        const loc = ev.location.replace(/,?\s*France\s*$/i, '').trim()
        const parts = loc.split(',').map((s) => s.trim()).filter(Boolean)
        const geo = await geocodeFrFirst([
          loc,
          parts.slice(1).join(', '),
          loc.match(/\b\d{5}\s+[^,]+/)?.[0] ?? '',
          parts[parts.length - 1] ?? '',
        ].filter(Boolean))
        if (!geo) continue

        const descr = stripHtml(ev.description.replace(/<[^>]+>/g, ' '))
        events.push({
          source: SRC,
          source_id: `permafr-${hashStr(ev.uid)}`,
          source_url: firstLink(ev.description) ?? AGENDA,
          title: ev.summary.replace(/\s+/g, ' ').trim(),
          description: (descr || ev.summary).slice(0, 500),
          organizer: `Réseau de permaculture — ${calName}`,
          location_name: loc.slice(0, 200),
          lat: geo.lat,
          lng: geo.lng,
          starts_at: ev.start,
          ends_at: ev.end,
          cost: 'Voir l’événement',
        })
      }
    }
    return events
  },
}
