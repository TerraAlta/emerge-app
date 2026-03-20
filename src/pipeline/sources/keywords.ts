/**
 * Search keywords derived from the Emerge soul document — ALL dimensions.
 * Used by city-based scrapers (Meetup, Eventbrite) to find regenerative events.
 */

/** Full soul document keyword set across all dimensions */
export const KEYWORDS: string[] = [
  // Land & Nature
  'permaculture',
  'food forest',
  'community garden',
  'seed swap',
  'natural building',
  'rewilding',
  'habitat restoration',
  'foraging',
  'wild food',
  'gleaning',
  'apple pressing',
  'wassail',

  // Circular & Repair
  'repair cafe',
  'tool library',
  'zero waste',
  'clothing swap',
  'fermentation',
  'sourdough',
  'composting',

  // Community & Economy
  'transition town',
  'solidarity economy',
  'time bank',
  'doughnut economics',
  'degrowth',
  'community kitchen',
  'disco soup',
  'community land trust',
  'ecocide law',

  // Arts & Theatre
  'theatre of the oppressed',
  'forum theatre',
  'playback theatre',
  'community choir',
  'singing circle',
  'drum circle',

  // Wellness & Inner
  'ecotherapy',
  'forest bathing',
  'climate grief',
  'work that reconnects',
  'birth circle',
  'postnatal circle',

  // Energy & Infrastructure
  'community energy',
  'ecovillage',
  'regenerative agriculture',
  'agroforestry',
]

/**
 * Max keywords to use per city for Meetup/Eventbrite searches.
 * Full set is used — rate limiting handles the volume.
 */
export const MAX_KEYWORDS_PER_CITY = 46
