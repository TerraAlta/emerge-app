/**
 * Mobilizon scraper — federated open-source event platform.
 *
 * Mobilizon is an ActivityPub-based events platform used heavily by the
 * French / EU transition, permaculture, climat and autogestion networks.
 * Each instance exposes a public GraphQL endpoint at /api, NO auth required.
 *
 * We hit several instances known to host regenerative content, search by
 * keywords that match the soul doc, and normalise to RawEvent.
 *
 * Verified 2026-04-22:
 *   - mobilizon.fr: 633 future events (permaculture=2)
 *   - keskonfai.fr: 221k future events (permaculture=344, compost=99,
 *     jardin partagé=57) — an aggregator of FR ecological/sustainability events
 *   - mobilizon.it: 72 future events
 *   - mobilizon.extinctionrebellion.fr: ~35 future events
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const INSTANCES = [
  'https://keskonfai.fr',
  'https://mobilizon.fr',
  'https://mobilizon.it',
  'https://mobilizon.extinctionrebellion.fr',
]

// Soul-doc aligned keywords, mostly French (the network is FR-heavy).
// Portuguese and English terms added for geographic breadth; duplicates
// are de-duplicated via event URL.
const KEYWORDS = [
  'permaculture',
  'agroécologie',
  'agroforesterie',
  'jardin partagé',
  'jardin communautaire',
  'compost',
  'compostage',
  'repair cafe',
  'repair café',
  'transition',
  'écolieu',
  'écovillage',
  'fresque du climat',
  'zero déchet',
  'zéro déchet',
  'graines',
  'semences',
  'forêt comestible',
  'food forest',
  'community garden',
  'foraging',
  'rewilding',
]

const TIMEOUT_MS = 15_000
const LIMIT_PER_KEYWORD = 50
const PAUSE_BETWEEN_MS = 600 // be gentle with community instances

const QUERY = `query Search($term: String, $limit: Int) {
  searchEvents(term: $term, limit: $limit) {
    total
    elements {
      ... on Event {
        title
        beginsOn
        endsOn
        url
        description
        physicalAddress {
          street
          locality
          postalCode
          country
          geom
        }
        organizerActor { preferredUsername name url }
        tags { title }
        picture { url }
        options { isOnline }
      }
    }
  }
}`

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

/** Mobilizon geom is "lng;lat" (NOTE: not lat;lng). */
function parseGeom(geom: string | null | undefined): { lat: number; lng: number } {
  if (!geom || typeof geom !== 'string') return { lat: 0, lng: 0 }
  const [lngStr, latStr] = geom.split(';')
  const lat = parseFloat(latStr ?? '0')
  const lng = parseFloat(lngStr ?? '0')
  if (!isFinite(lat) || !isFinite(lng)) return { lat: 0, lng: 0 }
  return { lat, lng }
}

async function searchInstance(instance: string, term: string): Promise<RawEvent[]> {
  const res = await fetch(`${instance}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { term, limit: LIMIT_PER_KEYWORD } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) return []
  const json: any = await res.json().catch(() => null)
  const elements: any[] = json?.data?.searchEvents?.elements ?? []
  const out: RawEvent[] = []
  const now = new Date()

  for (const ev of elements) {
    if (!ev?.title || !ev?.beginsOn || !ev?.url) continue
    const starts = new Date(ev.beginsOn)
    if (!isFinite(starts.getTime()) || starts < now) continue

    const { lat, lng } = parseGeom(ev.physicalAddress?.geom)
    const isOnline = !!ev.options?.isOnline
    if (isOnline) continue // soul doc: physical presence > online

    const addr = ev.physicalAddress || {}
    const locParts = [addr.street, addr.locality, addr.postalCode, addr.country]
      .filter(Boolean)
    const locName = locParts.length ? locParts.join(', ') : 'See event page'

    const org = ev.organizerActor
    const organizer = org?.name || org?.preferredUsername || 'Mobilizon'

    out.push({
      source: `mobilizon:${new URL(instance).host}`,
      source_id: `mobilizon-${hashStr(ev.url)}`,
      source_url: ev.url,
      title: stripHtml(ev.title),
      description: stripHtml(ev.description || '').slice(0, 500),
      organizer,
      location_name: locName,
      lat,
      lng,
      starts_at: starts.toISOString(),
      ends_at: ev.endsOn ? new Date(ev.endsOn).toISOString() : null,
      cost: 'See event page',
      image_url: ev.picture?.url || null,
    })
  }
  return out
}

export const mobilizon: SourceFetcher = {
  name: 'mobilizon',

  async fetch(): Promise<RawEvent[]> {
    const seen = new Set<string>()
    const all: RawEvent[] = []

    for (const instance of INSTANCES) {
      let instanceCount = 0
      for (const term of KEYWORDS) {
        try {
          const events = await searchInstance(instance, term)
          for (const e of events) {
            if (!e.source_url || seen.has(e.source_url)) continue
            seen.add(e.source_url)
            all.push(e)
            instanceCount++
          }
        } catch (err) {
          // Soft fail — instance may be down. Log once per instance×term.
          console.warn(`[mobilizon] ${instance} "${term}" failed:`, (err as Error).message)
        }
        await sleep(PAUSE_BETWEEN_MS)
      }
      console.log(`[mobilizon] ${instance}: +${instanceCount} unique events`)
    }

    console.log(`[mobilizon] Total: ${all.length} unique events across ${INSTANCES.length} instances`)
    return all
  },
}
