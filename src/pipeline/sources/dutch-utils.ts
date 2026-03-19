/** Parse Dutch date strings like "15 maart 2026" or "15-03-2026" */
const DUTCH_MONTHS: Record<string, number> = {
  januari: 0, februari: 1, maart: 2, april: 3,
  mei: 4, juni: 5, juli: 6, augustus: 7, september: 8,
  oktober: 9, november: 10, december: 11,
  jan: 0, feb: 1, mrt: 2, apr: 3, jun: 5, jul: 6,
  aug: 7, sep: 8, okt: 9, nov: 10, dec: 11,
}

export function parseDutchDate(str: string): Date | null {
  if (!str) return null

  // "15 maart 2026"
  const longMatch = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
  if (longMatch) {
    const month = DUTCH_MONTHS[longMatch[2].toLowerCase()]
    if (month !== undefined) return new Date(parseInt(longMatch[3]), month, parseInt(longMatch[1]))
  }

  // "15-03-2026" (DD-MM-YYYY)
  const dashMatch = str.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (dashMatch) return new Date(parseInt(dashMatch[3]), parseInt(dashMatch[2]) - 1, parseInt(dashMatch[1]))

  // "15/03/2026"
  const slashMatch = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slashMatch) return new Date(parseInt(slashMatch[3]), parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]))

  const parsed = new Date(str)
  return isNaN(parsed.getTime()) ? null : parsed
}

export function extractDutchDate(html: string): string {
  const dtMatch = html.match(/datetime="([^"]*)"/)
  if (dtMatch) { const d = parseDutchDate(dtMatch[1]); if (d) return d.toISOString() }

  const longMatch = html.match(/(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})/i)
  if (longMatch) { const d = parseDutchDate(longMatch[0]); if (d) return d.toISOString() }

  const dashMatch = html.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (dashMatch) { const d = parseDutchDate(dashMatch[0]); if (d) return d.toISOString() }

  return new Date().toISOString()
}

/** Rough lat/lng for major Dutch/Belgian cities */
const CITY_COORDS: Record<string, [number, number]> = {
  amsterdam: [52.3676, 4.9041], rotterdam: [51.9225, 4.4792],
  utrecht: [52.0907, 5.1214], 'den haag': [52.0705, 4.3007],
  eindhoven: [51.4416, 5.4697], groningen: [53.2194, 6.5665],
  tilburg: [51.5555, 5.0913], almere: [52.3508, 5.2647],
  breda: [51.5719, 4.7683], nijmegen: [51.8126, 5.8372],
  arnhem: [51.9851, 5.8987], haarlem: [52.3874, 4.6462],
  leiden: [52.1601, 4.4970], delft: [52.0116, 4.3571],
  maastricht: [50.8514, 5.6910], zwolle: [52.5168, 6.0830],
  leeuwarden: [53.2012, 5.7999], deventer: [52.2560, 6.1552],
  wageningen: [51.9692, 5.6654], amersfoort: [52.1561, 5.3878],
  // Belgian
  brussel: [50.8503, 4.3517], antwerpen: [51.2194, 4.4025],
  gent: [51.0543, 3.7174], brugge: [51.2093, 3.2247],
  leuven: [50.8798, 4.7005], luik: [50.6292, 5.5797],
}

export function geocodeDutchCity(text: string): { lat: number; lng: number } | null {
  const lower = text.toLowerCase()
  for (const [city, [lat, lng]] of Object.entries(CITY_COORDS)) {
    if (lower.includes(city)) return { lat, lng }
  }
  return null
}
