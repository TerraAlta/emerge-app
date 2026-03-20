/**
 * National Trust UK — nationaltrust.org.uk/volunteer
 * Large charity with thousands of volunteer events.
 * They have an internal API for their "What's on" section.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr, haversine, extractJsonLd } from './utils'

const WHATS_ON = 'https://www.nationaltrust.org.uk/visit/whats-on'
const VOLUNTEER = 'https://www.nationaltrust.org.uk/volunteer'

// NT uses a Next.js-like API. Their search endpoints:
const API_URLS = [
  'https://www.nationaltrust.org.uk/api/search/events?limit=20&type=volunteer',
  'https://www.nationaltrust.org.uk/api/events?category=volunteering&limit=20',
]

export const nationalTrustUk: SourceFetcher = {
  name: 'national-trust-uk',
  async fetch() {
    // Strategy 1: Try internal API
    for (const url of API_URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'application/json' },
        })
        if (!res.ok) continue
        const data = await res.json()
        const items = data.results ?? data.events ?? data.data ?? []
        if (items.length === 0) continue

        return items.slice(0, 20).map((e: any) => ({
          source: 'national-trust-uk',
          source_id: `nt-${e.id || hashStr(e.title || '')}`,
          source_url: e.url ? `https://www.nationaltrust.org.uk${e.url}` : VOLUNTEER,
          title: stripHtml(e.title || e.name || ''),
          description: stripHtml(e.description || e.summary || '').slice(0, 500),
          organizer: e.place?.title || 'National Trust',
          location_name: e.place?.title || e.location || 'UK',
          lat: parseFloat(e.place?.latitude || e.latitude || '0'),
          lng: parseFloat(e.place?.longitude || e.longitude || '0'),
          starts_at: e.startDate ? new Date(e.startDate).toISOString() : new Date().toISOString(),
          ends_at: e.endDate ? new Date(e.endDate).toISOString() : null,
          cost: 'Free (volunteer)',
        }))
      } catch { continue }
    }

    // Strategy 2: Scrape the volunteer page
    try {
      const res = await fetch(VOLUNTEER, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
      })
      if (!res.ok) return []
      const html = await res.text()

      // Try JSON-LD
      const jsonLd = extractJsonLd(html, 'national-trust-uk')
      if (jsonLd.length > 0) return jsonLd

      // Try embedded __NEXT_DATA__ (NT uses Next.js)
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1])
          const props = nextData.props?.pageProps ?? {}
          const events = props.events ?? props.activities ?? props.volunteerOpportunities ?? []
          if (events.length > 0) {
            return events.slice(0, 20).map((e: any) => ({
              source: 'national-trust-uk',
              source_id: `nt-${e.id || hashStr(e.title || '')}`,
              source_url: e.path ? `https://www.nationaltrust.org.uk${e.path}` : VOLUNTEER,
              title: e.title || e.name || '',
              description: stripHtml(e.description || e.standfirst || '').slice(0, 500),
              organizer: e.place?.name || 'National Trust',
              location_name: e.place?.name || 'UK',
              lat: 0, lng: 0,
              starts_at: e.date ? new Date(e.date).toISOString() : new Date().toISOString(),
              cost: 'Free (volunteer)',
            }))
          }
        } catch { /* fall through */ }
      }

      return []
    } catch (err) {
      console.warn('[national-trust-uk] scrape failed:', (err as Error).message)
      return []
    }
  },
}
