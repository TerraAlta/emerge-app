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

// Named HTML entities we decode: Latin-1 (all the accented letters) plus common
// typographic ones. Anything else becomes a space, as before.
const ENTITIES: Record<string, number> = {
  quot: 34, amp: 38, apos: 39, lt: 60, gt: 62, nbsp: 160, iexcl: 161, cent: 162,
  pound: 163, curren: 164, yen: 165, brvbar: 166, sect: 167, uml: 168, copy: 169, ordf: 170,
  laquo: 171, not: 172, shy: 173, reg: 174, macr: 175, deg: 176, plusmn: 177, sup2: 178,
  sup3: 179, acute: 180, micro: 181, para: 182, middot: 183, cedil: 184, sup1: 185, ordm: 186,
  raquo: 187, frac14: 188, frac12: 189, frac34: 190, iquest: 191, Agrave: 192, Aacute: 193, Acirc: 194,
  Atilde: 195, Auml: 196, Aring: 197, AElig: 198, Ccedil: 199, Egrave: 200, Eacute: 201, Ecirc: 202,
  Euml: 203, Igrave: 204, Iacute: 205, Icirc: 206, Iuml: 207, ETH: 208, Ntilde: 209, Ograve: 210,
  Oacute: 211, Ocirc: 212, Otilde: 213, Ouml: 214, times: 215, Oslash: 216, Ugrave: 217, Uacute: 218,
  Ucirc: 219, Uuml: 220, Yacute: 221, THORN: 222, szlig: 223, agrave: 224, aacute: 225, acirc: 226,
  atilde: 227, auml: 228, aring: 229, aelig: 230, ccedil: 231, egrave: 232, eacute: 233, ecirc: 234,
  euml: 235, igrave: 236, iacute: 237, icirc: 238, iuml: 239, eth: 240, ntilde: 241, ograve: 242,
  oacute: 243, ocirc: 244, otilde: 245, ouml: 246, divide: 247, oslash: 248, ugrave: 249, uacute: 250,
  ucirc: 251, uuml: 252, yacute: 253, thorn: 254, yuml: 255, OElig: 338, oelig: 339, Scaron: 352,
  scaron: 353, Yuml: 376, circ: 710, tilde: 732, ensp: 8194, emsp: 8195, thinsp: 8201, ndash: 8211,
  mdash: 8212, lsquo: 8216, rsquo: 8217, sbquo: 8218, ldquo: 8220, rdquo: 8221, bdquo: 8222, dagger: 8224,
  bull: 8226, hellip: 8230, prime: 8242, lsaquo: 8249, rsaquo: 8250, euro: 8364, trade: 8482,
}

function decodeEntity(_m: string, body: string): string {
  const cp = body[0] === '#'
    ? (body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10))
    : ENTITIES[body]
  if (cp === undefined || !Number.isFinite(cp) || cp === 160) return ' '
  // Control characters and invalid code points: drop
  if (cp < 32 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) return ''
  return String.fromCodePoint(cp)
}

/**
 * Tags out, entities decoded (é, ç, ã… — sites often write them as &eacute;
 * or &#233;), whitespace collapsed. Decoding is a single pass, so
 * "&amp;eacute;" stays the literal text "&eacute;".
 *
 * Until 2026-10-06 this deleted every entity, so accented letters vanished
 * ("está" → "est"). Stored events whose title changes because of the fix are
 * renamed in place by the quests_adopt_reencoded_twin trigger instead of
 * being duplicated.
 */
export function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

/** Decode HTML entities in one pass (shared with the news cleaner). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, decodeEntity)
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
