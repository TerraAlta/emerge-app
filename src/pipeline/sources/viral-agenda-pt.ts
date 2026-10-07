/**
 * Viral Agenda — viralagenda.com — Portugal's big open event catalogue.
 *
 * Mostly culture, so we never read whole city pages: we run Portuguese
 * keyword searches (`/pt/search?term=…` returns JSON with event ids), then
 * open each hit's event page. Every event page carries schema.org JSON-LD
 * for that event AND the same organiser's other upcoming events, so a few
 * searches surface whole programmes (e.g. the Jardim Botânico da Ajuda's
 * horta / compostagem / permacultura workshops).
 *
 * Added 2026-10-07 after a Portugal-only Eventbrite sweep found 1 new event in
 * 11 cities: the Portuguese regenerative scene lists here, not on Eventbrite.
 * Verified reachable from GitHub Actions. bulk: true — pre-filter applies.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'viral-agenda-pt'
const BASE = 'https://www.viralagenda.com'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36'
const DELAY_MS = 1200
const MAX_EVENT_PAGES = 80

const KEYWORDS = [
  'permacultura', 'horta', 'hortas comunitárias', 'compostagem', 'sementes', 'troca de sementes',
  'repair café', 'reparação', 'lixo zero', 'desperdício zero', 'agroecologia', 'agrofloresta',
  'floresta alimentar', 'bioconstrução', 'ecoaldeia', 'plantação de árvores', 'voluntariado ambiental',
  'apicultura', 'fermentação', 'cogumelos', 'economia circular', 'feira de trocas', 'cooperativa',
  'transição', 'agricultura biológica', 'jardinagem',
]

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function get(url: string, accept = 'text/html'): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'pt-PT,pt;q=0.9' },
      signal: AbortSignal.timeout(20_000),
    })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

function eventItems(html: string): any[] {
  const out: any[] = []
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1])
      const items = Array.isArray(data) ? data : data['@graph'] ?? [data]
      for (const it of items) {
        if (it?.name && it?.startDate && /Event$/.test(String(it['@type'] ?? ''))) out.push(it)
      }
    } catch { /* skip malformed block */ }
  }
  return out
}

function toRaw(it: any): RawEvent | null {
  const start = new Date(it.startDate)
  if (isNaN(start.getTime()) || start.getTime() < Date.now()) return null
  if (String(it.eventAttendanceMode ?? '').includes('Online')) return null
  const loc = it.location ?? {}
  const addr = loc.address ?? {}
  const place = [loc.name, addr.streetAddress, addr.addressLocality].filter(Boolean).join(', ')
  if (!place) return null
  const end = it.endDate ? new Date(it.endDate) : null
  const geo = loc.geo ?? {}
  return {
    source: SRC,
    source_id: `${SRC}-${hashStr(String(it.url ?? it.name) + start.toISOString())}`,
    source_url: it.url ?? null,
    title: stripHtml(String(it.name)).replace(/\s+/g, ' ').trim(),
    description: stripHtml(String(it.description ?? '')).slice(0, 500),
    organizer: loc.name ?? 'Viral Agenda',
    location_name: place + (addr.addressCountry === 'PT' || !addr.addressCountry ? ', Portugal' : ''),
    // No coordinates in the markup — the orchestrator geocodes location_name.
    lat: Number(geo.latitude) || 0,
    lng: Number(geo.longitude) || 0,
    starts_at: start.toISOString(),
    ends_at: end && !isNaN(end.getTime()) ? end.toISOString() : null,
    cost: 'See event page',
    image_url: typeof it.image === 'string' ? it.image : null,
  }
}

export const viralAgendaPt: SourceFetcher = {
  name: SRC,
  bulk: true,

  async fetch() {
    // 1. Keyword searches → event page URLs
    const pages = new Set<string>()
    for (const term of KEYWORDS) {
      const body = await get(`${BASE}/pt/search?term=${encodeURIComponent(term)}`, 'application/json')
      try {
        const results = body ? JSON.parse(body)?.results ?? {} : {}
        for (const [key, val] of Object.entries<any>(results)) {
          if (key.startsWith('e_') && val?.slug) pages.add(`${BASE}/pt/events/${key.slice(2)}/${val.slug}`)
        }
      } catch { /* not JSON — skip */ }
      await sleep(DELAY_MS)
    }

    // 2. Event pages → JSON-LD (the hit + its organiser's other events)
    const byUrl = new Map<string, RawEvent>()
    let opened = 0
    for (const url of pages) {
      if (opened >= MAX_EVENT_PAGES) break
      if (byUrl.has(url)) continue // already seen as a sibling on another page
      opened++
      const html = await get(url)
      if (html) {
        for (const it of eventItems(html)) {
          const ev = toRaw(it)
          if (ev?.source_url && !byUrl.has(ev.source_url)) byUrl.set(ev.source_url, ev)
        }
      }
      await sleep(DELAY_MS)
    }

    console.log(`[${SRC}] ${KEYWORDS.length} searches → ${pages.size} hits, ${opened} pages opened → ${byUrl.size} upcoming events`)
    return [...byUrl.values()]
  },
}
