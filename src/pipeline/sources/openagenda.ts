/**
 * OpenAgenda scraper — public European event platform.
 *
 * OpenAgenda is heavily used by French / BE / CH / LU municipalities,
 * associations, and ecological networks (ADEME, Colibris, FAB'LIM,
 * regional transition initiatives). Free key, 1000 req/day limit.
 *
 * Free-tier caveat: the cross-agenda `/v2/events` search endpoint is
 * paywalled. But we have free access to:
 *   /v2/agendas?search={term}         → list agendas matching a keyword
 *   /v2/agendas/{slug}/events         → fetch events within an agenda
 *
 * Strategy: search agendas by permaculture-aligned keywords, dedup
 * agenda slugs across keywords, fetch upcoming events per agenda.
 *
 * Requires env: OPENAGENDA_API_KEY
 * Docs: https://developers.openagenda.com/10-read/
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const API = 'https://api.openagenda.com/v2'
const TIMEOUT_MS = 15_000
const AGENDAS_PER_KEYWORD = 15
const EVENTS_PER_AGENDA = 100
const PAUSE_MS = 250 // respect 1000 req/day budget

// Permaculture-aligned keywords. French first (OpenAgenda is FR-heavy)
// plus a few English for completeness. Keep list small to stay well
// under 1000 req/day across weekly + daily pipelines.
const KEYWORDS = [
  'permaculture',
  'agroécologie',
  'agroforesterie',
  'transition écologique',
  'jardin partagé',
  'compostage',
  'repair café',
  'zéro déchet',
  'écolieu',
  'fresque du climat',
  'biodynamie',
  'semences paysannes',
  'forêt comestible',
]

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

interface AgendaBrief { slug: string; title: string; uid: number }

async function searchAgendas(key: string, term: string): Promise<AgendaBrief[]> {
  const url = `${API}/agendas?search=${encodeURIComponent(term)}&size=${AGENDAS_PER_KEYWORD}&key=${key}`
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) {
    console.warn(`[openagenda] agenda search "${term}" HTTP ${res.status}`)
    return []
  }
  const json: any = await res.json().catch(() => null)
  const list: any[] = json?.agendas ?? []
  return list
    .filter(a => a?.slug && a?.uid)
    .map(a => ({ slug: a.slug as string, title: a.title as string, uid: a.uid as number }))
}

async function fetchAgendaEvents(key: string, agenda: AgendaBrief): Promise<RawEvent[]> {
  const url = `${API}/agendas/${encodeURIComponent(agenda.slug)}/events?relative=upcoming&size=${EVENTS_PER_AGENDA}&key=${key}`
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) return []
  const json: any = await res.json().catch(() => null)
  const events: any[] = json?.events ?? []
  const now = new Date()
  const out: RawEvent[] = []

  for (const ev of events) {
    // attendanceMode: 1 = offline, 2 = online, 3 = mixed
    if (ev?.attendanceMode === 2) continue // soul doc: physical presence

    const title = pickLang(ev?.title) || ''
    if (!title) continue

    const timing = ev?.firstTiming || ev?.lastTiming
    if (!timing?.begin) continue
    const starts = new Date(timing.begin)
    if (!isFinite(starts.getTime()) || starts < now) continue

    const loc = ev?.location || {}
    const lat = typeof loc.latitude === 'number' ? loc.latitude : 0
    const lng = typeof loc.longitude === 'number' ? loc.longitude : 0

    const locParts = [loc.name, loc.address, loc.city, loc.region, loc.countryCode]
      .filter(Boolean)
    const locName = locParts.length ? locParts.join(', ') : 'See event page'

    const eventUrl = ev?.slug
      ? `https://openagenda.com/${agenda.slug}/events/${ev.slug}`
      : null
    const sourceId = `openagenda-${ev?.uid || hashStr(eventUrl || title + timing.begin)}`

    // image URL construction
    const img = ev?.image
    let imageUrl: string | null = null
    if (img?.base && img?.filename) {
      imageUrl = `${img.base}${img.filename}`
    }

    out.push({
      source: 'openagenda',
      source_id: sourceId,
      source_url: eventUrl,
      title: stripHtml(title),
      description: stripHtml(pickLang(ev?.description) || '').slice(0, 500),
      organizer: agenda.title || 'OpenAgenda',
      location_name: locName,
      lat,
      lng,
      starts_at: starts.toISOString(),
      ends_at: timing.end ? new Date(timing.end).toISOString() : null,
      cost: 'See event page',
      image_url: imageUrl,
    })
  }
  return out
}

/** OpenAgenda fields are localized as {fr: '...', en: '...'}. Pick FR first, then any. */
function pickLang(field: any): string {
  if (!field) return ''
  if (typeof field === 'string') return field
  if (typeof field !== 'object') return ''
  return field.fr || field.en || field.es || field.it || field.de || Object.values(field)[0] || ''
}

export const openagenda: SourceFetcher = {
  name: 'openagenda',

  async fetch(): Promise<RawEvent[]> {
    const key = process.env.OPENAGENDA_API_KEY
    if (!key) {
      console.warn('[openagenda] OPENAGENDA_API_KEY not set — skipping')
      return []
    }

    // Step 1: search agendas across all keywords, dedup by slug
    const agendas = new Map<string, AgendaBrief>()
    for (const term of KEYWORDS) {
      try {
        const found = await searchAgendas(key, term)
        for (const a of found) {
          if (!agendas.has(a.slug)) agendas.set(a.slug, a)
        }
      } catch (err) {
        console.warn(`[openagenda] agenda search "${term}" failed:`, (err as Error).message)
      }
      await sleep(PAUSE_MS)
    }
    console.log(`[openagenda] discovered ${agendas.size} unique agendas across ${KEYWORDS.length} keywords`)

    // Step 2: fetch upcoming events per agenda, dedup by event uid
    const seen = new Set<string>()
    const all: RawEvent[] = []
    let agendaCount = 0

    for (const agenda of agendas.values()) {
      try {
        const events = await fetchAgendaEvents(key, agenda)
        for (const e of events) {
          if (seen.has(e.source_id)) continue
          seen.add(e.source_id)
          all.push(e)
        }
      } catch (err) {
        console.warn(`[openagenda] events in "${agenda.slug}" failed:`, (err as Error).message)
      }
      agendaCount++
      await sleep(PAUSE_MS)
    }

    console.log(`[openagenda] Total: ${all.length} unique events from ${agendaCount} agendas`)
    return all
  },
}
