const FR_MONTHS: Record<string, number> = {
  janvier: 0, 'février': 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, 'août': 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, 'décembre': 11, decembre: 11,
  jan: 0, fev: 1, 'fév': 1, mar: 2, avr: 3, jui: 5, jul: 6, sep: 8, oct: 9, nov: 10, 'déc': 11, dec: 11,
}

export function parseFrenchDate(str: string): Date | null {
  if (!str) return null
  const m = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i)
  if (m) { const mo = FR_MONTHS[m[2].toLowerCase()]; if (mo !== undefined) return new Date(parseInt(m[3]), mo, parseInt(m[1])) }
  const d = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (d) return new Date(parseInt(d[3]), parseInt(d[2]) - 1, parseInt(d[1]))
  const p = new Date(str); return isNaN(p.getTime()) ? null : p
}

export function extractFrenchDate(html: string): string {
  const dt = html.match(/datetime="([^"]*)"/)
  if (dt) { const d = parseFrenchDate(dt[1]); if (d) return d.toISOString() }
  const m = html.match(/(\d{1,2})\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+(\d{4})/i)
  if (m) { const d = parseFrenchDate(m[0]); if (d) return d.toISOString() }
  const dd = html.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); if (dd) { const d = parseFrenchDate(dd[0]); if (d) return d.toISOString() }
  return new Date().toISOString()
}

const FR_CITIES: Record<string, [number, number]> = {
  paris: [48.8566, 2.3522], lyon: [45.7640, 4.8357], marseille: [43.2965, 5.3698],
  toulouse: [43.6047, 1.4442], bordeaux: [44.8378, -0.5792], nantes: [47.2184, -1.5536],
  strasbourg: [48.5734, 7.7521], montpellier: [43.6108, 3.8767], lille: [50.6292, 3.0573],
  rennes: [48.1173, -1.6778], grenoble: [45.1885, 5.7245], dijon: [47.3220, 5.0415],
  angers: [47.4784, -0.5632], tours: [47.3941, 0.6848], limoges: [45.8336, 1.2611],
  'clermont-ferrand': [45.7772, 3.0870], perpignan: [42.6887, 2.8948],
  // Belgium
  bruxelles: [50.8503, 4.3517], brussels: [50.8503, 4.3517],
  antwerpen: [51.2194, 4.4025], anvers: [51.2194, 4.4025],
  gent: [51.0543, 3.7174], gand: [51.0543, 3.7174],
  brugge: [51.2093, 3.2247], bruges: [51.2093, 3.2247],
  leuven: [50.8798, 4.7005], louvain: [50.8798, 4.7005],
  'liège': [50.6292, 5.5797], liege: [50.6292, 5.5797], luik: [50.6292, 5.5797],
  namur: [50.4674, 4.8720], mons: [50.4542, 3.9562],
  charleroi: [50.4108, 4.4446], mechelen: [51.0259, 4.4776],
}

export function geocodeFrBe(text: string): { lat: number; lng: number } | null {
  const l = text.toLowerCase()
  for (const [c, [lat, lng]] of Object.entries(FR_CITIES)) { if (l.includes(c)) return { lat, lng } }
  return null
}
