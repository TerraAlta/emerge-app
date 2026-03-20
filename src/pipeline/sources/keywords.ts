/**
 * Search keywords derived from the Emerge soul document categories.
 * Used by city-based scrapers (Meetup, Eventbrite) to find regenerative events.
 */

export const KEYWORDS: string[] = [
  'permaculture',
  'community garden',
  'repair cafe',
  'seed swap',
  'food forest',
  'transition town',
  'ecovillage',
  'natural building',
  'foraging',
  'rewilding',
  'composting',
  'fermentation workshop',
  'zero waste',
  'clothing swap',
  'tool library',
  'skill share',
  'regenerative agriculture',
  'agroforestry',
  'community kitchen',
  'harvest festival',
]

/** Max keywords to use per city to keep request count manageable */
export const MAX_KEYWORDS_PER_CITY = 5
