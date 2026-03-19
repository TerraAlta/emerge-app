/**
 * Incredible Edible UK — incredibleedible.org.uk/find-a-group
 * Extracts community growing groups from embedded JSON data on the page.
 * Filters out entries without proper names.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, haversine } from './utils'

const URL = 'https://www.incredibleedible.org.uk/find-a-group/'

export const incredibleEdibleUk: SourceFetcher = {
  name: 'incredible-edible-uk',
  async fetch({ lat, lng, radiusKm }) {
    try {
      const res = await fetch(URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
      })
      if (!res.ok) { console.warn(`[incredible-edible-uk] ${res.status}`); return [] }
      const html = await res.text()

      // Look for embedded JSON (WordPress maps plugins embed marker data)
      const patterns = [
        /var\s+(?:groups|markers|locations|mapData)\s*=\s*(\[[\s\S]*?\]);/,
        /"markers"\s*:\s*(\[[\s\S]*?\])/,
        /JSON\.parse\('(\[.*?\])'\)/,
      ]

      for (const pattern of patterns) {
        const match = html.match(pattern)
        if (!match?.[1]) continue

        try {
          const data = JSON.parse(match[1])
          if (!Array.isArray(data)) continue

          return data
            .map((g: any) => {
              const name = stripHtml(g.title || g.name || g.post_title || '')
                .replace(/Friend$/, '')      // Remove trailing "Friend" tag
                .replace(/\s+/g, ' ')
                .trim()

              if (!name || name.length < 3) return null

              const gLat = parseFloat(g.lat || g.latitude || g.position?.lat || '0')
              const gLng = parseFloat(g.lng || g.longitude || g.position?.lng || '0')

              // Distance filter if we have coordinates
              if (gLat && gLng && haversine(lat, lng, gLat, gLng) > radiusKm) return null

              return {
                source: 'incredible-edible-uk' as const,
                source_id: `ie-${g.id || hashStr(name)}`,
                source_url: g.url || g.link || g.permalink || URL,
                title: `Incredible Edible ${name}`,
                description: stripHtml(g.description || g.excerpt || '').slice(0, 500) ||
                  `Community food growing group in ${name}. Volunteers welcome for planting, growing, and harvesting.`,
                organizer: `Incredible Edible ${name}`,
                location_name: g.location || g.address || g.city || name,
                lat: gLat,
                lng: gLng,
                starts_at: new Date().toISOString(), // Ongoing groups
                cost: 'Free',
              }
            })
            .filter(Boolean) as RawEvent[]
        } catch { continue }
      }

      // HTML fallback — grab group cards
      const events: RawEvent[] = []
      const blockPattern = /<(?:div|article|li)[^>]*class="[^"]*(?:group|listing|member|marker|entry)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi
      let match2
      while ((match2 = blockPattern.exec(html)) !== null && events.length < 30) {
        const block = match2[1]
        const titleMatch = block.match(/<h[234][^>]*>[\s]*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/h[234]>/i)
        if (!titleMatch) continue

        const title = stripHtml(titleMatch[2]).replace(/Friend$/, '').trim()
        if (!title || title.length < 3) continue

        events.push({
          source: 'incredible-edible-uk',
          source_id: `ie-${hashStr(title)}`,
          source_url: titleMatch[1] ? new URL(titleMatch[1], 'https://www.incredibleedible.org.uk').toString() : URL,
          title: `Incredible Edible ${title}`,
          description: `Community food growing group. Volunteers welcome for planting days, harvests, and sharing.`,
          organizer: title,
          location_name: 'UK',
          lat: 0, lng: 0,
          starts_at: new Date().toISOString(),
          cost: 'Free',
        })
      }

      return events
    } catch (err) {
      console.warn('[incredible-edible-uk] failed:', (err as Error).message)
      return []
    }
  },
}
