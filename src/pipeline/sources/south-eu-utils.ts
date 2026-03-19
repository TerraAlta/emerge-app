/** Spanish date parser — "15 de marzo de 2026" or "15/03/2026" */
const ES_MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
}
const IT_MONTHS: Record<string, number> = {
  gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
  luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
  gen: 0, feb: 1, mar: 2, apr: 3, mag: 4, giu: 5, lug: 6, ago: 7, set: 8, ott: 9, nov: 10, dic: 11,
}

function parseWithMonths(str: string, months: Record<string, number>): Date | null {
  if (!str) return null
  // "15 de marzo de 2026" or "15 marzo 2026"
  const m = str.match(/(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})/i)
  if (m) { const mo = months[m[2].toLowerCase()]; if (mo !== undefined) return new Date(parseInt(m[3]), mo, parseInt(m[1])) }
  // DD/MM/YYYY or DD-MM-YYYY
  const d = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (d) return new Date(parseInt(d[3]), parseInt(d[2]) - 1, parseInt(d[1]))
  const p = new Date(str); return isNaN(p.getTime()) ? null : p
}

export function parseSpanishDate(s: string): Date | null { return parseWithMonths(s, ES_MONTHS) }
export function parseItalianDate(s: string): Date | null { return parseWithMonths(s, IT_MONTHS) }

export function extractSpanishDate(html: string): string {
  const dt = html.match(/datetime="([^"]*)"/)
  if (dt) { const d = parseSpanishDate(dt[1]); if (d) return d.toISOString() }
  const m = html.match(/(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/i)
  if (m) { const d = parseSpanishDate(m[0]); if (d) return d.toISOString() }
  const dd = html.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); if (dd) { const d = parseSpanishDate(dd[0]); if (d) return d.toISOString() }
  return new Date().toISOString()
}

export function extractItalianDate(html: string): string {
  const dt = html.match(/datetime="([^"]*)"/)
  if (dt) { const d = parseItalianDate(dt[1]); if (d) return d.toISOString() }
  const m = html.match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i)
  if (m) { const d = parseItalianDate(m[0]); if (d) return d.toISOString() }
  const dd = html.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); if (dd) { const d = parseItalianDate(dd[0]); if (d) return d.toISOString() }
  return new Date().toISOString()
}

const ES_CITIES: Record<string, [number, number]> = {
  madrid: [40.4168, -3.7038], barcelona: [41.3874, 2.1686], valencia: [39.4699, -0.3763],
  sevilla: [37.3891, -5.9845], malaga: [36.7213, -4.4214], bilbao: [43.2630, -2.9350],
  granada: [37.1773, -3.5986], zaragoza: [41.6488, -0.8891], 'san sebastian': [43.3183, -1.9812],
  ibiza: [38.9067, 1.4206], cadiz: [36.5271, -6.2886], cordoba: [37.8882, -4.7794],
  mallorca: [39.5696, 2.6502], tenerife: [28.2916, -16.6291], galicia: [42.8805, -8.5456],
  asturias: [43.3614, -5.8593], cantabria: [43.1828, -3.9878], extremadura: [39.4937, -6.0679],
  navarra: [42.6953, -1.6323], aragon: [41.5976, -0.9057],
}
const IT_CITIES: Record<string, [number, number]> = {
  roma: [41.9028, 12.4964], milano: [45.4642, 9.1900], firenze: [43.7696, 11.2558],
  torino: [45.0703, 7.6869], napoli: [40.8518, 14.2681], bologna: [44.4949, 11.3426],
  venezia: [45.4408, 12.3155], palermo: [38.1157, 13.3615], genova: [44.4056, 8.9463],
  perugia: [43.1107, 12.3908], trento: [46.0748, 11.1217], trieste: [45.6495, 13.7768],
  damanhur: [45.4166, 7.8833], piemonte: [45.0522, 7.5158], toscana: [43.3500, 11.0167],
  umbria: [42.9384, 12.6216], lombardia: [45.5845, 9.2744], sardegna: [40.1209, 9.0129],
  sicilia: [37.5999, 14.0154], calabria: [39.0660, 16.3440],
}

export function geocodeSpanishCity(text: string): { lat: number; lng: number } | null {
  const l = text.toLowerCase()
  for (const [c, [lat, lng]] of Object.entries(ES_CITIES)) { if (l.includes(c)) return { lat, lng } }
  return null
}
export function geocodeItalianCity(text: string): { lat: number; lng: number } | null {
  const l = text.toLowerCase()
  for (const [c, [lat, lng]] of Object.entries(IT_CITIES)) { if (l.includes(c)) return { lat, lng } }
  return null
}
