/**
 * The Flower of Permaculture — learning domains for the Quests section.
 *
 * David Holmgren's canonical flower: an Ethics & Design Principles centre + 7
 * petals. The 7 petal keys/labels/colors intentionally mirror the Guild's
 * `flower-petals.ts` so Emerge has ONE consistent flower across the app.
 * (This file adds the Quests-only presentation: icon, ring angle, prereqs.)
 */

export type PetalStatus = 'locked' | 'available' | 'completed'

export interface QuestPetal {
  key: string
  label: string
  /** Short label for tight spaces / captions. */
  short: string
  /** Emoji glyph shown inside the petal. */
  icon: string
  description: string
  /** Warm earth-tone fill (matches flower-petals.ts). */
  color: string
  /** Degrees clockwise from top (12 o'clock). `null` = the Ethics centre. */
  angle: number | null
  /** Petal keys that must be completed before this one unlocks. */
  requires: string[]
}

export const ETHICS_KEY = 'ethics'

// 7 petals evenly around the ring (360 / 7 ≈ 51.43° apart), centre first.
export const QUEST_PETALS: QuestPetal[] = [
  {
    key: 'ethics', label: 'Ethics & Design Principles', short: 'Ethics', icon: '🧭', color: '#C8913A',
    description: 'Earth care, people care, fair share — the roots every design grows from.',
    angle: null, requires: [],
  },
  {
    key: 'land-nature', label: 'Land & Nature Stewardship', short: 'Land', icon: '🌿', color: '#4A7C59',
    description: 'Soil, water, forests and food — tending the living systems that hold everything.',
    angle: 0, requires: ['ethics'],
  },
  {
    key: 'building-technology', label: 'Building & Technology', short: 'Building', icon: '🏡', color: '#8B6B3D',
    description: 'Shelter and pattern — natural building and whole-system design.',
    angle: 51.43, requires: ['ethics'],
  },
  {
    key: 'tools-materials', label: 'Tools & Materials', short: 'Tools', icon: '🔧', color: '#6D4C2A',
    description: 'Appropriate tools, repair and circular materials that serve life.',
    angle: 102.86, requires: ['building-technology'],
  },
  {
    key: 'finance-economics', label: 'Finance & Economics', short: 'Economy', icon: '🪙', color: '#B07D2E',
    description: 'Regenerative money, exchange and enterprise beyond extraction.',
    angle: 154.29, requires: ['ethics'],
  },
  {
    key: 'governance-community', label: 'Governance & Community', short: 'Governance', icon: '🤝', color: '#5B8FA8',
    description: 'Holding land in common and deciding together, fairly and well.',
    angle: 205.71, requires: ['finance-economics'],
  },
  {
    key: 'health-wellbeing', label: 'Health & Wellbeing', short: 'Health', icon: '🧘', color: '#9B72AA',
    description: 'Bodily, communal and inner health — resilience and care.',
    angle: 257.14, requires: ['ethics'],
  },
  {
    key: 'education-culture', label: 'Education & Culture', short: 'Culture', icon: '📖', color: '#6B7DB3',
    description: 'Learning, story and culture — how knowledge and meaning pass on.',
    angle: 308.57, requires: ['ethics'],
  },
]

export const QUEST_PETAL_MAP: Record<string, QuestPetal> =
  Object.fromEntries(QUEST_PETALS.map(p => [p.key, p]))

export const OUTER_PETALS = QUEST_PETALS.filter(p => p.angle !== null)

/** Per-petal progress for the current user. */
export interface PetalProgress {
  status: PetalStatus
  /** Fraction of the petal's quests completed, 0..1. */
  pct: number
}

export type QuestProgress = Record<string, PetalProgress>

/**
 * PLACEHOLDER base state until every petal has its own quests. Petals with
 * authored content (currently land-nature) derive their real state from
 * completion in quest-progress.ts; petals without content fall back to this.
 */
export const MOCK_PROGRESS: QuestProgress = {
  ethics:                { status: 'available', pct: 0 },
  'land-nature':         { status: 'available', pct: 0 },
  'building-technology': { status: 'available', pct: 0 },
  'finance-economics':   { status: 'available', pct: 0 },
  'health-wellbeing':    { status: 'available', pct: 0 },
  'education-culture':   { status: 'available', pct: 0 },
  'tools-materials':     { status: 'locked', pct: 0 },
  'governance-community':{ status: 'locked', pct: 0 },
}

export function getPetalProgress(progress: QuestProgress, key: string): PetalProgress {
  return progress[key] ?? { status: 'locked', pct: 0 }
}

/** Overall bloom fraction across the centre + 7 petals, 0..1. */
export function bloomFraction(progress: QuestProgress): number {
  const done = QUEST_PETALS.filter(p => getPetalProgress(progress, p.key).status === 'completed').length
  return done / QUEST_PETALS.length
}
