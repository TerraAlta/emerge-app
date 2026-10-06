/**
 * Les Compaillons — RFCP, Réseau Français de la Construction Paille (rfcp.fr)
 * Straw-bale building network: trainings (Pro-Paille, enduits terre/chaux,
 * paille porteuse), chantiers and network meetings across France.
 *
 * The old domains are dead: compaillons.org doesn't resolve and
 * compaillons.fr now hosts an unrelated shopping-centre directory.
 *
 * rfcp.fr/lagenda/ is a "Simple Calendar" (Google Calendar) list with
 * schema.org microdata (startDate/endDate with UTC offset, address). The page
 * shows ~6 weeks; further windows come from the plugin's public AJAX action
 * (simcal_default_calendar_draw_list, ts = data-next). All-day entries are
 * stamped 00:00:59 local — we assume a 09:00 start for those.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { hashStr, stripHtml } from './utils'
import { UA, getText, geocodeFrFirst, isOnline } from './fr2-common'

const SRC = 'compaillons-fr'
const PAGE = 'https://www.rfcp.fr/lagenda/'
const AJAX = 'https://www.rfcp.fr/wp-admin/admin-ajax.php'
const MAX_WINDOWS = 8
const MAX_EVENTS = 200

interface Item {
  title: string
  start: string
  end: string | null
  address: string
  description: string
  link: string | null
}

/** "2026-10-06T00:00:59+02:00" → ISO UTC; all-day (00:00:xx) → 09:00 local. */
function toIso(content: string | undefined, allDayHour: number): string | null {
  if (!content) return null
  const m = content.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}([+-]\d{2}:\d{2}|Z)$/)
  if (!m) return null
  const allDay = m[2] === '00' && m[3] === '00'
  const t = allDay ? `${String(allDayHour).padStart(2, '0')}:00:00` : `${m[2]}:${m[3]}:00`
  const d = new Date(`${m[1]}T${t}${m[4]}`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function parseList(html: string): { items: Item[]; next: number | null } {
  const $ = load(html)
  const items: Item[] = []
  $('li.simcal-event').each((_, el) => {
    const li = $(el)
    const title = li.find('.simcal-event-title').first().text().replace(/\s+/g, ' ').trim()
    const start = toIso(li.find('[itemprop="startDate"]').attr('content'), 9)
    if (!title || !start) return
    const end = toIso(li.find('[itemprop="endDate"]').attr('content'), 18)
    const address = (li.find('meta[itemprop="address"]').attr('content') ?? '').replace(/\s+/g, ' ').trim()
    const descEl = li.find('.simcal-event-description')
    const link = descEl.find('a[href^="http"]').filter((_, a) => !/^mailto:/i.test($(a).attr('href') ?? '')).first().attr('href') ?? null
    const description = stripHtml((descEl.html() ?? '').replace(/<(br|\/p|\/li|\/b)\b[^>]*>/gi, ' $&'))
    items.push({ title, start, end, address, description, link })
  })
  const nextAttr = $('.simcal-events-list-container').attr('data-next')
  return { items, next: nextAttr ? parseInt(nextAttr, 10) : null }
}

export const compaillonsFr: SourceFetcher = {
  name: SRC,
  async fetch() {
    const page = await getText(PAGE)
    if (!page) return []
    const $ = load(page)
    const cal = $('.simcal-calendar').first()
    const calId = cal.attr('data-calendar-id')
    const calEnd = parseInt(cal.attr('data-calendar-end') ?? '0', 10)

    const all: Item[] = []
    let { items, next } = parseList(page)
    all.push(...items)
    for (let i = 0; i < MAX_WINDOWS && calId && next && (!calEnd || next <= calEnd); i++) {
      const body = new URLSearchParams({ action: 'simcal_default_calendar_draw_list', ts: String(next), id: calId })
      const txt = await getText(AJAX, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      if (!txt) break
      let html = ''
      try { html = JSON.parse(txt)?.data ?? '' } catch { break }
      if (!html) break
      const r = parseList(html)
      if (!r.items.length && r.next === next) break
      all.push(...r.items)
      next = r.next
    }

    const seen = new Set<string>()
    const events: RawEvent[] = []
    for (const it of all) {
      if (events.length >= MAX_EVENTS) break
      const key = `${it.title}|${it.start}`
      if (seen.has(key)) continue
      seen.add(key)
      if (new Date(it.start).getTime() < Date.now()) continue
      if (!it.address || isOnline(`${it.title} ${it.address}`)) continue

      // "16 Rue des Artisans, 36300 Ciron, France" — try full, then "36300 Ciron"
      const parts = it.address.split(',').map((s) => s.trim()).filter((s) => s && !/^france$/i.test(s))
      const cp = it.address.match(/\b(\d{5})\s+([^,]+)/)
      const geo = await geocodeFrFirst([
        parts.join(', '),
        parts.slice(1).join(', '),
        cp ? `${cp[1]} ${cp[2]}` : '',
      ].filter(Boolean))
      if (!geo) continue

      const org = it.title.match(/\[([^\]]+)\]/)
      events.push({
        source: SRC,
        source_id: `rfcp-${hashStr(key)}`,
        source_url: it.link ?? PAGE,
        title: it.title,
        description: (it.description || it.title).slice(0, 500),
        organizer: org ? `${org[1]} (RFCP)` : 'RFCP — Réseau Français de la Construction Paille',
        location_name: parts.join(', ').slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: it.start,
        ends_at: it.end && it.end > it.start ? it.end : null,
        cost: 'See event page',
      })
    }
    return events
  },
}
