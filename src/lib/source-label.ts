/**
 * Human-readable "via …" label for an event's source. Shared by the feed,
 * event detail and map so internal pipeline names (eventbrite-priority,
 * meetup-cities, mobilizon:instance) never show to users.
 */
const SOURCE_DISPLAY: Record<string, string> = {
  'redeconvergir.pt': 'Rede Convergir',
  'gaia.org.pt': 'GAIA Portugal',
  'repaircafe.org': 'Repair Caf\u00e9 Network',
  'transitionnetwork.org': 'Transition Network',
  'permaculture.org.uk': 'Permaculture Association',
  'findhorn.org': 'Findhorn Foundation',
  'communitylandscotland.org.uk': 'Community Land Scotland',
  'landvernd.is': 'Landvernd',
  'slowfood.com': 'Slow Food',
  'greenpeace.org': 'Greenpeace',
  'umanotera.si': 'Umanotera',
  'allevents.in': 'AllEvents',
}

export function displaySourceName(sourceName: string | null | undefined, sourceUrl?: string | null): string {
  if (!sourceName) return ''
  // Internal pipeline names never reach users ("eventbrite-priority" leaked
  // into the feed, detail and map views until 2026-10-07).
  if (sourceName === 'user') return 'a community member'
  if (sourceName.startsWith('eventbrite')) return 'Eventbrite'
  if (sourceName.startsWith('meetup')) return 'Meetup'
  if (sourceName.startsWith('allevents')) return 'AllEvents'
  if (sourceName.startsWith('mobilizon:')) return sourceName.slice('mobilizon:'.length)
  if (sourceName === 'local-networks' && sourceUrl) {
    try {
      const host = new URL(sourceUrl).hostname.replace(/^www\./, '')
      if (SOURCE_DISPLAY[host]) return SOURCE_DISPLAY[host]
      // Check partial domain matches
      for (const [domain, name] of Object.entries(SOURCE_DISPLAY)) {
        if (host.endsWith(domain)) return name
      }
      return host
    } catch { /* fall through */ }
  }
  // Fallback: clean up the source name
  return sourceName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
