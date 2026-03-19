/**
 * Verified public Telegram BROADCAST CHANNELS for regenerative events.
 *
 * VERIFIED means: t.me/s/<handle> returns visible messages (not just a contact card).
 * Only broadcast channels have public web previews — groups and user accounts do not.
 *
 * Status: verified 2026-03-19
 *
 * To add a channel:
 * 1. Open https://t.me/s/<handle> in a browser
 * 2. If you see messages → it's a public broadcast channel ✅
 * 3. If you see "Send Message" button only → it's a user/group ❌
 */

export interface TelegramChannel {
  handle: string          // without @
  name: string
  language: string        // ISO 639-1
  country: string         // ISO 3166-1 alpha-2 or 'GLOBAL'
  topics: string[]
  subscribers: number     // approximate, at time of verification
  defaultLat: number
  defaultLng: number
  verified: boolean       // true = confirmed public broadcast channel with messages
}

// ─── VERIFIED PUBLIC BROADCAST CHANNELS ───
// These return actual messages via t.me/s/<handle>

export const VERIFIED_CHANNELS: TelegramChannel[] = [
  {
    handle: 'SPBchannel',
    name: 'Survivalism, Permaculture & Bushcraft',
    language: 'en', country: 'GLOBAL',
    topics: ['permaculture', 'bushcraft', 'off-grid', 'food forests', 'homesteading'],
    subscribers: 8380, defaultLat: 51.5074, defaultLng: -0.1278,
    verified: true,
  },
  {
    handle: 'worldpermacultureassociation',
    name: 'World Permaculture Association',
    language: 'en', country: 'GLOBAL',
    topics: ['permaculture', 'agroecology', 'regenerative agriculture', 'education'],
    subscribers: 277, defaultLat: 51.5074, defaultLng: -0.1278,
    verified: true,
  },
  {
    handle: 'growtogetherfoodgardens',
    name: 'Grow Together Food & Medicinal Gardens',
    language: 'en', country: 'GB',
    topics: ['community gardens', 'food growing', 'garden design', 'food security'],
    subscribers: 392, defaultLat: 51.5074, defaultLng: -0.1278,
    verified: true,
  },
  {
    handle: 'GardenOfLifeCommunityProjects',
    name: 'Garden of Life Community Projects',
    language: 'en', country: 'US',
    topics: ['homesteading', 'permaculture', 'composting', 'community', 'seed saving'],
    subscribers: 32, defaultLat: 35.55, defaultLng: -82.55, // NC area
    verified: true,
  },
  {
    handle: 'livingsoilgardening',
    name: 'Living Soil Gardening',
    language: 'en', country: 'IT',
    topics: ['regenerative agriculture', 'CSA', 'soil health', 'internships', 'food forests'],
    subscribers: 200, defaultLat: 43.77, defaultLng: 11.25, // Florence
    verified: true,
  },
  {
    handle: 'regenerativeagriculture',
    name: 'Regenerative Agriculture',
    language: 'en', country: 'GLOBAL',
    topics: ['regenerative farming', 'soil health', 'agroecology'],
    subscribers: 59, defaultLat: 40.7128, defaultLng: -74.006,
    verified: true,
  },
]

// ─── UNVERIFIED CHANNELS TO CHECK ───
// These handles are plausible but returned "Send Message" only (user/group accounts).
// They may have public groups that need the bot to be added as member.
// Keep them here as candidates for bot-joined groups.

export const CANDIDATE_GROUPS: TelegramChannel[] = [
  {
    handle: 'permaculturelibrary',
    name: 'Permaculture Library',
    language: 'en', country: 'GLOBAL',
    topics: ['permaculture', 'books', 'knowledge', 'PDC'],
    subscribers: 0, defaultLat: 51.5074, defaultLng: -0.1278,
    verified: false,
  },
  {
    handle: 'navdanyainternational',
    name: 'Navdanya International (unverified)',
    language: 'en', country: 'IN',
    topics: ['seed saving', 'food sovereignty', 'Vandana Shiva'],
    subscribers: 0, defaultLat: 30.3165, defaultLng: 78.0322,
    verified: false,
  },
  {
    handle: 'localfutures',
    name: 'Local Futures (unverified)',
    language: 'en', country: 'GLOBAL',
    topics: ['localisation', 'economics of happiness', 'Helena Norberg-Hodge'],
    subscribers: 0, defaultLat: 51.5074, defaultLng: -0.1278,
    verified: false,
  },
  {
    handle: 'ecovillages',
    name: 'Ecovillages (unverified)',
    language: 'en', country: 'GLOBAL',
    topics: ['ecovillages', 'intentional communities', 'GEN'],
    subscribers: 138, defaultLat: 52.52, defaultLng: 13.405,
    verified: false,
  },
  {
    handle: 'foodsovereigntynow',
    name: 'Food Sovereignty Now (unverified)',
    language: 'en', country: 'GLOBAL',
    topics: ['food sovereignty', 'seed saving', 'agroecology'],
    subscribers: 0, defaultLat: 48.8566, defaultLng: 2.3522,
    verified: false,
  },
]

// Only export verified channels for the scraper
export const TELEGRAM_CHANNELS = VERIFIED_CHANNELS

/**
 * Get channels filtered by country code or 'GLOBAL'.
 */
export function getChannelsForRegion(countryCodes: string[]): TelegramChannel[] {
  const codes = new Set(countryCodes.map(c => c.toUpperCase()))
  return TELEGRAM_CHANNELS.filter(ch =>
    codes.has(ch.country) || codes.has('GLOBAL') || ch.country === 'GLOBAL'
  )
}
