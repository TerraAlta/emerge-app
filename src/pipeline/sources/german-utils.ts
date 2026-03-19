/** Parse German date strings like "15. März 2026" or "15.03.2026" */
const GERMAN_MONTHS: Record<string, number> = {
  januar: 0, februar: 1, 'märz': 2, maerz: 2, april: 3,
  mai: 4, juni: 5, juli: 6, august: 7, september: 8,
  oktober: 9, november: 10, dezember: 11,
  jan: 0, feb: 1, mär: 2, mar: 2, apr: 3,
  jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dez: 11,
}

export function parseGermanDate(str: string): Date | null {
  if (!str) return null

  // "15. März 2026" or "15 März 2026"
  const longMatch = str.match(/(\d{1,2})\.?\s+(\w+)\s+(\d{4})/)
  if (longMatch) {
    const month = GERMAN_MONTHS[longMatch[2].toLowerCase()]
    if (month !== undefined) {
      return new Date(parseInt(longMatch[3]), month, parseInt(longMatch[1]))
    }
  }

  // "15.03.2026" (DD.MM.YYYY)
  const dotMatch = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (dotMatch) {
    return new Date(parseInt(dotMatch[3]), parseInt(dotMatch[2]) - 1, parseInt(dotMatch[1]))
  }

  // "2026-03-15" (ISO)
  const isoMatch = str.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return new Date(isoMatch[0])
  }

  // Try native Date parse as last resort
  const parsed = new Date(str)
  return isNaN(parsed.getTime()) ? null : parsed
}

/** Extract German dates from an HTML block */
export function extractGermanDate(html: string): string {
  // datetime attribute
  const dtMatch = html.match(/datetime="([^"]*)"/)
  if (dtMatch) {
    const d = parseGermanDate(dtMatch[1])
    if (d) return d.toISOString()
  }

  // German long date
  const longMatch = html.match(/(\d{1,2})\.?\s+(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i)
  if (longMatch) {
    const d = parseGermanDate(longMatch[0])
    if (d) return d.toISOString()
  }

  // DD.MM.YYYY
  const dotMatch = html.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (dotMatch) {
    const d = parseGermanDate(dotMatch[0])
    if (d) return d.toISOString()
  }

  return new Date().toISOString()
}
