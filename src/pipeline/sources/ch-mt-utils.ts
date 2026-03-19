/** Swiss + Maltese geocoding and date parsing */

// Swiss cities (DE/FR/IT regions)
const CH_CITIES: Record<string, [number, number]> = {
  'zürich': [47.3769, 8.5417], zurich: [47.3769, 8.5417], zuerich: [47.3769, 8.5417],
  bern: [46.9480, 7.4474], basel: [47.5596, 7.5886], genf: [46.2044, 6.1432],
  'genève': [46.2044, 6.1432], geneve: [46.2044, 6.1432], geneva: [46.2044, 6.1432],
  lausanne: [46.5197, 6.6323], luzern: [47.0502, 8.3093], lucerne: [47.0502, 8.3093],
  'st. gallen': [47.4245, 9.3767], winterthur: [47.5001, 8.7240],
  lugano: [46.0037, 8.9511], biel: [47.1368, 7.2467], thun: [46.7580, 7.6280],
  glarisegg: [47.6667, 9.0833], steckborn: [47.6667, 9.0833],
  aarau: [47.3925, 8.0442], fribourg: [46.8065, 7.1620],
}

// Malta (everything within 50km)
const MT_CITIES: Record<string, [number, number]> = {
  valletta: [35.8989, 14.5146], malta: [35.9375, 14.3754],
  mdina: [35.8858, 14.4031], gozo: [36.0444, 14.2518],
  sliema: [35.9110, 14.5028], 'st julians': [35.9183, 14.4906],
  mosta: [35.9094, 14.4256], rabat: [35.8819, 14.3986],
  attard: [35.8894, 14.4369], marsaxlokk: [35.8417, 14.5436],
}

export function geocodeSwiss(text: string): { lat: number; lng: number } | null {
  const l = text.toLowerCase()
  for (const [c, [lat, lng]] of Object.entries(CH_CITIES)) { if (l.includes(c)) return { lat, lng } }
  return null
}

export function geocodeMalta(text: string): { lat: number; lng: number } | null {
  const l = text.toLowerCase()
  for (const [c, [lat, lng]] of Object.entries(MT_CITIES)) { if (l.includes(c)) return { lat, lng } }
  // Default to center of Malta if any Maltese reference
  if (l.includes('malt')) return { lat: 35.9375, lng: 14.3754 }
  return null
}

/** Multi-language date extraction (DE/FR/IT/EN) */
export function extractMultiDate(html: string): string {
  const dt = html.match(/datetime="([^"]*)"/)
  if (dt) { const d = new Date(dt[1]); if (!isNaN(d.getTime())) return d.toISOString() }

  // German: 15. März 2026
  const de = html.match(/(\d{1,2})\.?\s+(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i)
  if (de) { const d = parseDeDate(de[0]); if (d) return d.toISOString() }

  // French: 15 mars 2026
  const fr = html.match(/(\d{1,2})\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+(\d{4})/i)
  if (fr) { const d = parseFrDate(fr[0]); if (d) return d.toISOString() }

  // English: March 15, 2026 or 15 March 2026
  const en = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i)
    || html.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
  if (en) { const d = new Date(en[0]); if (!isNaN(d.getTime())) return d.toISOString() }

  // DD.MM.YYYY or DD/MM/YYYY
  const num = html.match(/(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/)
  if (num) return new Date(parseInt(num[3]), parseInt(num[2]) - 1, parseInt(num[1])).toISOString()

  return new Date().toISOString()
}

const DE_M: Record<string, number> = { januar:0,februar:1,'märz':2,maerz:2,april:3,mai:4,juni:5,juli:6,august:7,september:8,oktober:9,november:10,dezember:11 }
const FR_M: Record<string, number> = { janvier:0,'février':1,fevrier:1,mars:2,avril:3,mai:4,juin:5,juillet:6,'août':7,aout:7,septembre:8,octobre:9,novembre:10,'décembre':11,decembre:11 }

function parseDeDate(s: string): Date | null {
  const m = s.match(/(\d{1,2})\.?\s+(\w+)\s+(\d{4})/); if (!m) return null
  const mo = DE_M[m[2].toLowerCase()]; return mo !== undefined ? new Date(parseInt(m[3]), mo, parseInt(m[1])) : null
}
function parseFrDate(s: string): Date | null {
  const m = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/); if (!m) return null
  const mo = FR_M[m[2].toLowerCase()]; return mo !== undefined ? new Date(parseInt(m[3]), mo, parseInt(m[1])) : null
}
