/**
 * IVN Natuureducatie — ivn.nl
 * Netherlands' biggest nature education org, 25,000+ volunteers, ~170 local
 * branches (afdelingen) running guided walks, excursions, talks, workshops
 * and nature-management work days.
 *
 * The national calendar lives at /natuuractiviteiten/ (there is no /agenda/).
 * It is a FacetWP listing whose map facet is preloaded into the page as
 *   window.FWP_JSON = {...preload_data.settings.map.locations: [...]}
 * — every geolocated activity (~700) with lat/lng, title, type, date and start
 * time, in one request. We read that instead of paging through the HTML.
 *
 * Markers with time "00:00" are umbrella pages / multi-day programmes without
 * a real start time (e.g. "Al onze natuur-activiteiten", "Jaarprogramma
 * 2026"), so they are skipped. Online/webinar, cancelled and fully booked
 * activities are skipped too. Times are Europe/Amsterdam local.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'

const SRC = 'ivn-nl'
const ORG = 'IVN Natuureducatie'
const URL = 'https://www.ivn.nl/natuuractiviteiten/'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0; +https://emerge.terralta.org)'
const MAX_EVENTS = 200

const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7,
  augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
}

function amsOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Amsterdam', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

/** Europe/Amsterdam wall-clock time → UTC ISO string */
function amsIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - amsOffsetMin(guess) * 60000).toISOString()
}

interface Marker {
  position?: { lat?: number; lng?: number }
  post_id?: number
  content?: string
}

function titleCase(slug: string): string {
  return slug.split('-').filter(Boolean)
    .map((w) => (w === 's' ? "'s" : w[0].toUpperCase() + w.slice(1)))
    .join(' ').replace(/^'s /, "'s-")
}

export const ivnNl: SourceFetcher = {
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

    const m = html.match(/window\.FWP_JSON\s*=\s*(\{[\s\S]*?\});\s*<\/script>/)
    if (!m) return []
    let markers: Marker[] = []
    try {
      markers = JSON.parse(m[1])?.preload_data?.settings?.map?.locations ?? []
    } catch {
      return []
    }

    const now = Date.now()
    const seen = new Set<number>()
    const events: RawEvent[] = []
    for (const mk of markers) {
      const c = mk.content ?? ''
      const lat = Number(mk.position?.lat)
      const lng = Number(mk.position?.lng)
      if (!mk.post_id || seen.has(mk.post_id)) continue
      // Netherlands (+ border) sanity box
      if (!(lat > 50.6 && lat < 53.7 && lng > 3.2 && lng < 7.3)) continue

      const link = c.match(/<a class="h4" href="([^"]+)"/)?.[1]
      const title = stripHtml(c.match(/<a class="h4"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '')
      const type = stripHtml(c.match(/<span class="type">([\s\S]*?)<\/span>/)?.[1] ?? '')
      const subjects = [...c.matchAll(/<span class="subject">([\s\S]*?)<\/span>/g)].map((x) => stripHtml(x[1]))
      const dateTxt = stripHtml(c.match(/<span class="date">([\s\S]*?)<\/span>/)?.[1] ?? '')
      const timeTxt = stripHtml(c.match(/<span class="time">([\s\S]*?)<\/span>/)?.[1] ?? '')
      if (!link || !title) continue

      // "woensdag 07 oktober 2026" + "14:00"
      const dm = dateTxt.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i)
      const tm = timeTxt.match(/^(\d{1,2}):(\d{2})$/)
      const mo = dm ? MONTHS[dm[2].toLowerCase()] : undefined
      if (!dm || !mo || !tm) continue
      if (tm[1] === '00' && tm[2] === '00') continue // no real start time

      if (/online|webinar/i.test(type)) continue
      if (/\b(online|webinar|zoom|livestream)\b/i.test(title)) continue
      if (/volgeboekt|vol\s*geboekt|geannuleerd|afgelast|gaat niet door/i.test(title)) continue

      const startsAt = amsIso(+dm[3], mo, +dm[1], +tm[1], +tm[2])
      if (Date.parse(startsAt) < now + 3600_000) continue

      const afdeling = link.match(/\/afdeling\/([^/]+)\//)?.[1]
      const branch = afdeling ? titleCase(afdeling) : ''
      seen.add(mk.post_id)
      events.push({
        source: SRC,
        source_id: `ivn-${mk.post_id}`,
        source_url: link,
        title,
        description: [
          `${type || 'Natuuractiviteit'} van ${branch ? `IVN ${branch}` : ORG}.`,
          subjects.length ? `Thema: ${subjects.join(', ')}.` : '',
        ].filter(Boolean).join(' '),
        organizer: branch ? `${ORG} — afdeling ${branch}` : ORG,
        location_name: branch ? `${branch} (IVN-afdeling)` : 'Nederland',
        lat,
        lng,
        starts_at: startsAt,
        ends_at: null,
        cost: 'Zie activiteit',
      })
    }

    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return events.slice(0, MAX_EVENTS)
  },
}
