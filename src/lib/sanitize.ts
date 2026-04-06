/** Strip HTML tags from a string */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim()
}

/** Sanitize event text: strip HTML, trim, truncate */
export function sanitizeText(text: string, maxLength = 2000): string {
  return stripHtml(text).slice(0, maxLength).trim()
}

/** Sanitize a title: strip HTML, trim, truncate */
export function sanitizeTitle(text: string): string {
  return stripHtml(text).slice(0, 300).trim()
}

/** Validate coordinates are within valid bounds */
export function validateCoordinates(lat: number, lng: number): { lat: number; lng: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (isNaN(lat) || isNaN(lng)) return null
  if (lat < -90 || lat > 90) return null
  if (lng < -180 || lng > 180) return null
  if (lat === 0 && lng === 0) return null // null island — likely missing data
  return { lat, lng }
}
