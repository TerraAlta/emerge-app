/**
 * Ecology Action Centre — Halifax, Nova Scotia (ecologyaction.ca)
 *
 * The events page (Drupal + CiviCRM, https://ecologyaction.ca/get-involved/events)
 * embeds its FullCalendar data in drupalSettings: every CiviCRM event with
 * title, detail URL and local start/end ("2026-10-17T09:30:00", calendar
 * time zone America/Halifax). We keep upcoming ones, drop virtual/cancelled/
 * participants-only items, and read the venue from each detail page's
 * "Where: … When: …" block (shared pages such as the hike series list one
 * block per date; we pick the one whose date matches). Venues are geocoded
 * within Nova Scotia; without a venue the event is placed in Halifax.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, geocodeFirst, ONLINE_RE, type LatLng } from './misc-common'

const SRC = 'ecology-action-ca'
const PAGE = 'https://ecologyaction.ca/get-involved/events'
const TZ = 'America/Halifax'
const HALIFAX: LatLng = { lat: 44.6488, lng: -63.5752 }
const MAX_DETAIL = 15
const SKIP_RX = /cancel+ed|participants only|postponed|\(virtual\)/i
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

interface CalEvent { title: string; id: string; eid?: string; url?: string; start: string; end?: string }

function offsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** "2026-10-17T09:30:00" (Halifax wall clock) → ISO UTC. */
function halifaxIso(local: string | undefined): string | null {
  const m = local?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  const first = guess - offsetMin(guess) * 60000
  return new Date(guess - offsetMin(first) * 60000).toISOString()
}

function calendarEvents(html: string): CalEvent[] {
  const raw = html.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/)?.[1]
  if (!raw) return []
  try {
    const settings = JSON.parse(raw)
    const out: CalEvent[] = []
    for (const view of settings.fullCalendarView ?? []) {
      const opts = typeof view.calendar_options === 'string' ? JSON.parse(view.calendar_options) : view.calendar_options
      for (const e of opts?.events ?? []) if (e?.title && e?.start) out.push(e)
    }
    return out
  } catch {
    return []
  }
}

/** All "Where: X When: Y" blocks on a detail page. */
function whereBlocks(text: string): Array<{ where: string; when: string }> {
  const out: Array<{ where: string; when: string }> = []
  for (const m of text.matchAll(/Where\s*:\s*(.{3,160}?)\s*When\s*:\s*(.{3,80}?)(?=\s*(?:Details|Cost|Price|Register|Terrain|$|[A-Z][a-z]+ [a-z]+ [a-z]+))/g)) {
    out.push({ where: m[1].trim(), when: m[2].trim() })
  }
  return out
}

export const ecologyActionCa: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(PAGE)
    if (!html) return []
    const now = Date.now()
    const upcoming = calendarEvents(html)
      .map((e) => ({ e, start: halifaxIso(e.start) }))
      .filter((x): x is { e: CalEvent; start: string } => !!x.start && Date.parse(x.start) > now + 3600_000)
      .filter(({ e }) => !SKIP_RX.test(e.title) && !ONLINE_RE.test(e.title))
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 100)

    const pages = new Map<string, string | null>()
    const out: RawEvent[] = []
    for (const { e, start } of upcoming) {
      const url = e.url && /^https:\/\/ecologyaction\.ca\//.test(e.url) ? e.url : null
      let text: string | null = null
      if (url) {
        if (!pages.has(url) && pages.size < MAX_DETAIL) {
          const page = await getText(url)
          pages.set(url, page ? stripHtml(page.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|h\d|li)>|<br\s*\/?>/gi, ' ')) : null)
        }
        text = pages.get(url) ?? null
      }

      // Venue: the Where block whose "When" names this event's date, else the only one.
      const blocks = text ? whereBlocks(text) : []
      const d = new Date(Date.parse(start) + offsetMin(Date.parse(start)) * 60000) // Halifax wall clock
      const mon = MONTHS[d.getUTCMonth()]
      const day = d.getUTCDate()
      const dayRx = new RegExp(`\\b${mon}[a-z]*\\.?\\s+${day}\\b`, 'i')
      const block = blocks.find((b) => dayRx.test(b.when)) ?? (blocks.length === 1 ? blocks[0] : undefined)
      const where = block?.where.replace(/\s+/g, ' ') ?? ''
      if (ONLINE_RE.test(where) || /zoom|virtual/i.test(where)) continue

      let geo: LatLng | null = null
      if (where) {
        const street = where.match(/\(([^)]*\d[^)]*)\)/)?.[1]
        geo = await geocodeFirst([
          street ? `${street}, Halifax, Nova Scotia` : '',
          `${where.replace(/\(.*?\)/g, '').trim()}, Nova Scotia`,
          `${where.split(',')[0]}, Nova Scotia`,
        ], 'ca')
      }

      const endIso = halifaxIso(e.end)
      const intro = text ? text.slice(Math.max(0, text.indexOf(stripHtml(e.title).split(' - ')[0]))).slice(0, 600) : ''
      out.push({
        source: SRC,
        source_id: `eac-${e.eid ?? e.id}-${start.slice(0, 10)}`,
        source_url: url ?? PAGE,
        title: stripHtml(e.title),
        description: (intro || `${stripHtml(e.title)} — an Ecology Action Centre event.`).slice(0, 500),
        organizer: 'Ecology Action Centre',
        location_name: where ? `${where}${geo ? '' : ', Halifax, NS'}` : 'Halifax, NS (see event page)',
        lat: (geo ?? HALIFAX).lat,
        lng: (geo ?? HALIFAX).lng,
        starts_at: start,
        ends_at: endIso && endIso > start ? endIso : null,
        cost: 'See event page',
      })
    }
    return out
  },
}
