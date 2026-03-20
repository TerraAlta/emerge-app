import type { RawEvent } from './types'

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '').replace(/&\w+;/g, ' ').replace(/\s+/g, ' ').trim()
}

export function hashStr(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

/** Extract JSON-LD Event objects from HTML */
export function extractJsonLd(html: string, source: string): RawEvent[] {
  const events: RawEvent[] = []
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? []

  for (const block of blocks) {
    try {
      const json = block.replace(/<\/?script[^>]*>/g, '').trim()
      const data = JSON.parse(json)
      let items = Array.isArray(data) ? data : data['@graph'] ?? [data]

      // Unwrap ItemList > ListItem.item (used by Eventbrite)
      if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
        items = data.itemListElement
          .map((li: any) => li.item ?? li)
          .filter((i: any) => i['@type'] === 'Event')
      }

      for (const item of items) {
        if (item['@type'] !== 'Event') continue
        if (!item.name || !item.startDate) continue
        if (new Date(item.startDate) < new Date()) continue

        const loc = item.location ?? {}
        const geo = loc.geo ?? {}

        events.push({
          source,
          source_id: `${source}-${hashStr(item.name + item.startDate)}`,
          source_url: item.url ?? null,
          title: stripHtml(item.name),
          description: stripHtml(item.description ?? '').slice(0, 500),
          organizer: item.organizer?.name ?? source,
          location_name: loc.name ?? loc.address?.addressLocality ?? 'See event page',
          lat: parseFloat(geo.latitude ?? '0'),
          lng: parseFloat(geo.longitude ?? '0'),
          starts_at: new Date(item.startDate).toISOString(),
          ends_at: item.endDate ? new Date(item.endDate).toISOString() : null,
          cost: item.isAccessibleForFree ? 'Free' : (item.offers?.price ? `${item.offers.priceCurrency ?? '€'}${item.offers.price}` : 'See event page'),
          image_url: typeof item.image === 'string' ? item.image : item.image?.url ?? null,
        })
      }
    } catch { /* skip malformed */ }
  }

  return events
}
