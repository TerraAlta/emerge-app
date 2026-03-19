/**
 * Mundraub Germany — mundraub.org
 * Community foraging map + events. Has an API for map markers.
 * Events are at mundraub.org/community or /blog.
 */
import type { RawEvent, SourceFetcher } from './types'
import { haversine, stripHtml, hashStr } from './utils'

const API_URL = 'https://mundraub.org/api/node?type=fruitmap'
const EVENTS_URL = 'https://mundraub.org/community'

export const mundraubDe: SourceFetcher = {
  name: 'mundraub-de',
  async fetch({ lat, lng, radiusKm }) {
    const events: RawEvent[] = []

    // Try their community/events page
    try {
      const res = await fetch(EVENTS_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
      })
      if (res.ok) {
        const html = await res.text()
        events.push(...scrapeEvents(html))
      }
    } catch (err) {
      console.warn('[mundraub-de] events scrape failed:', (err as Error).message)
    }

    // Try the foraging map API — convert nearby fruit trees into foraging "quests"
    try {
      const res = await fetch(
        `https://mundraub.org/cluster/node?bbox=${lng - 1},${lat - 1},${lng + 1},${lat + 1}&zoom=10&cat=2,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)' } }
      )
      if (res.ok) {
        const data = await res.json()
        if (data.features) {
          const nearby = data.features
            .filter((f: any) => {
              if (!f.geometry?.coordinates) return false
              const [fLng, fLat] = f.geometry.coordinates
              return haversine(lat, lng, fLat, fLng) <= radiusKm
            })
            .slice(0, 10)

          for (const f of nearby) {
            const [fLng, fLat] = f.geometry.coordinates
            const props = f.properties || {}
            events.push({
              source: 'mundraub-de',
              source_id: `mundraub-${props.nid || hashStr(JSON.stringify(f.geometry))}`,
              source_url: props.nid ? `https://mundraub.org/node/${props.nid}` : 'https://mundraub.org',
              title: `Foraging spot — ${props.type_title || 'Fruit tree'}`,
              description: `Community-mapped foraging location. ${props.type_title || 'Fruit tree'} available for harvesting. Part of the Mundraub community foraging network.`,
              organizer: 'Mundraub community',
              location_name: 'See map',
              lat: fLat,
              lng: fLng,
              starts_at: new Date().toISOString(), // ongoing
              cost: 'Free',
            })
          }
        }
      }
    } catch (err) {
      console.warn('[mundraub-de] API failed:', (err as Error).message)
    }

    return events
  },
}

function scrapeEvents(html: string): RawEvent[] {
  const events: RawEvent[] = []
  const blockPattern = /<(?:article|div)[^>]*class="[^"]*(?:event|community|action)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div)>/gi
  let match

  while ((match = blockPattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<h[23][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[23]>/i)
    if (!titleMatch) continue

    const title = stripHtml(titleMatch[2]).trim()
    if (!title || title.length < 5) continue

    events.push({
      source: 'mundraub-de',
      source_id: `mundraub-evt-${hashStr(title)}`,
      source_url: titleMatch[1] ? new URL(titleMatch[1], 'https://mundraub.org').toString() : EVENTS_URL,
      title,
      description: 'Mundraub community event. See link for details.',
      organizer: 'Mundraub',
      location_name: 'Germany',
      lat: 0, lng: 0,
      starts_at: new Date().toISOString(),
      cost: 'Free',
    })
  }

  return events
}
