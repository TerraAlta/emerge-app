/**
 * Diaspora cultural celebration keywords for Eventbrite + Meetup searches.
 * These target communal feasts and cultural celebrations by diaspora and
 * minority communities — events that score 85+ under the Communal Table
 * soul document additions.
 */

/** Core cultural feast keywords — searched via existing Eventbrite + Meetup scrapers */
export const CULTURAL_KEYWORDS: string[] = [
  // Persian / Nowruz
  'Nowruz', 'Norouz', 'Nauryz', 'Persian New Year', 'nowruz feast',

  // Islamic / Ramadan / Eid
  'community iftar', 'open iftar', 'iftar dinner', 'Eid celebration',
  'Eid feast', 'Eid al-Fitr', 'Eid al-Adha', 'breaking fast together',

  // Hindu / Diwali
  'Diwali feast', 'Diwali celebration open', 'Deepavali community',
  'Festival of Lights community',

  // Lunar New Year
  'Lunar New Year feast', 'Chinese New Year community',
  'Tết celebration', 'Seollal community', 'spring festival community',

  // Caribbean
  'Caribbean feast', 'Caribbean community dinner', 'jerk cookout community',
  'West Indian feast',

  // African
  'African dinner community', 'African community feast',
  'African food festival',

  // South Asian
  'South Asian cultural', 'South Asian community dinner',
  'community biryani', 'Langar community',

  // General communal feast
  'community feast', 'cultural potluck', 'community potluck',
  'neighbourhood feast', 'street feast', 'community dinner open',
  'shared meal community', 'communal table', 'long table dinner community',
  'harvest supper', 'solstice feast', 'equinox feast',
  'Imbolc feast', 'Samhain feast', 'wassail feast',

  // Food rescue / communal cooking
  'Disco Soup', 'Schnippeldisko', 'FoodCycle', 'community cook-up',
  'surplus feast', 'rescued food dinner',
]

/**
 * Seasonal calendar for diaspora cultural celebrations.
 * During the active window, these keywords get searched at 2x frequency.
 */
export interface SeasonalWindow {
  name: string
  /** Month (1-indexed) and day for window start */
  startMonth: number
  startDay: number
  /** Month (1-indexed) and day for window end */
  endMonth: number
  endDay: number
  /** Extra keywords to search during this window */
  boostKeywords: string[]
}

/**
 * Get the approximate Ramadan start date for a given year.
 * The Islamic calendar shifts ~11 days earlier each Gregorian year.
 * This uses a rough approximation — accurate to ±2 days.
 */
function getRamadanStart(year: number): { month: number; day: number } {
  // Known: Ramadan 2024 started ~March 11
  // Shifts back ~11 days per year
  const base = new Date(2024, 2, 11) // March 11, 2024
  const shift = (year - 2024) * 11
  const approx = new Date(base.getTime() - shift * 86400000)
  return { month: approx.getMonth() + 1, day: approx.getDate() }
}

/**
 * Get approximate Eid al-Adha date for a given year.
 * ~70 days after Ramadan start.
 */
function getEidAlAdha(year: number): { month: number; day: number } {
  const ramadan = getRamadanStart(year)
  const base = new Date(year, ramadan.month - 1, ramadan.day)
  const eid = new Date(base.getTime() + 70 * 86400000)
  return { month: eid.getMonth() + 1, day: eid.getDate() }
}

/**
 * Get approximate Diwali date for a given year.
 * Falls in Oct-Nov; using known dates and interpolation.
 */
function getDiwali(year: number): { month: number; day: number } {
  // Known dates: 2024=Nov 1, 2025=Oct 20, 2026=Nov 8, 2027=Oct 29
  const known: Record<number, { month: number; day: number }> = {
    2024: { month: 11, day: 1 },
    2025: { month: 10, day: 20 },
    2026: { month: 11, day: 8 },
    2027: { month: 10, day: 29 },
    2028: { month: 10, day: 17 },
    2029: { month: 11, day: 5 },
    2030: { month: 10, day: 26 },
  }
  return known[year] ?? { month: 10, day: 28 } // fallback late Oct
}

/**
 * Get approximate Lunar New Year date for a given year.
 */
function getLunarNewYear(year: number): { month: number; day: number } {
  const known: Record<number, { month: number; day: number }> = {
    2024: { month: 2, day: 10 },
    2025: { month: 1, day: 29 },
    2026: { month: 2, day: 17 },
    2027: { month: 2, day: 6 },
    2028: { month: 1, day: 26 },
    2029: { month: 2, day: 13 },
    2030: { month: 2, day: 3 },
  }
  return known[year] ?? { month: 2, day: 1 } // fallback early Feb
}

/** Build seasonal windows for the current year */
export function getSeasonalWindows(): SeasonalWindow[] {
  const year = new Date().getFullYear()
  const ramadan = getRamadanStart(year)
  const eidAdha = getEidAlAdha(year)
  const diwali = getDiwali(year)
  const lunar = getLunarNewYear(year)

  function windowAround(m: number, d: number, days: number): { startMonth: number; startDay: number; endMonth: number; endDay: number } {
    const center = new Date(year, m - 1, d)
    const start = new Date(center.getTime() - days * 86400000)
    const end = new Date(center.getTime() + days * 86400000)
    return {
      startMonth: start.getMonth() + 1,
      startDay: start.getDate(),
      endMonth: end.getMonth() + 1,
      endDay: end.getDate(),
    }
  }

  return [
    {
      name: 'Nowruz',
      ...windowAround(3, 20, 14),
      boostKeywords: [
        'Nowruz', 'Persian New Year', 'Norouz', 'Nauryz',
        'nowruz feast', 'spring equinox celebration', 'haft-sin',
      ],
    },
    {
      name: 'Ramadan / Eid al-Fitr',
      ...windowAround(ramadan.month, ramadan.day, 21), // wider window for month-long fast
      boostKeywords: [
        'iftar', 'community iftar', 'open iftar', 'Eid feast',
        'Eid celebration', 'breaking fast together', 'iftar dinner open',
        'Eid al-Fitr', 'Ramadan community',
      ],
    },
    {
      name: 'Eid al-Adha',
      ...windowAround(eidAdha.month, eidAdha.day, 10),
      boostKeywords: [
        'Eid al-Adha', 'Eid feast', 'community Eid', 'Eid celebration',
      ],
    },
    {
      name: 'Diwali',
      ...windowAround(diwali.month, diwali.day, 14),
      boostKeywords: [
        'Diwali', 'Deepavali', 'Festival of Lights community',
        'Diwali feast', 'Diwali celebration open', 'Diwali dinner',
      ],
    },
    {
      name: 'Lunar New Year',
      ...windowAround(lunar.month, lunar.day, 14),
      boostKeywords: [
        'Lunar New Year', 'Chinese New Year', 'Tết', 'Seollal',
        'spring festival community', 'dumpling making',
      ],
    },
    {
      name: 'Caribbean Carnival season',
      startMonth: 7, startDay: 1,
      endMonth: 8, endDay: 31,
      boostKeywords: [
        'Notting Hill Carnival', 'Caribbean community',
        'West Indian feast', 'jerk cookout community',
        'Caribbean carnival', 'soca community',
      ],
    },
  ]
}

/** Check if today falls within any seasonal window */
export function getActiveSeasonalKeywords(): string[] {
  const now = new Date()
  const year = now.getFullYear()
  const windows = getSeasonalWindows()
  const extras: string[] = []

  for (const w of windows) {
    const start = new Date(year, w.startMonth - 1, w.startDay)
    const end = new Date(year, w.endMonth - 1, w.endDay)
    // Handle year wraparound
    if (end < start) {
      if (now >= start || now <= end) extras.push(...w.boostKeywords)
    } else {
      if (now >= start && now <= end) extras.push(...w.boostKeywords)
    }
  }

  return extras
}
