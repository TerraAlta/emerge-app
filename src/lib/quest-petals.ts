/**
 * The Flower of Permaculture — learning domains for the Quests section.
 *
 * NOTE: this is deliberately separate from `flower-petals.ts` (the Guild's
 * 7-domain practitioner flower). The Quests flower is a *learning* map with
 * 10 domains: an Ethics & Principles centre + 9 outer petals, exactly as the
 * gamified curriculum is structured. Keep the two independent.
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
  /** Warm earth-tone fill. */
  color: string
  /** Degrees clockwise from top (12 o'clock). `null` = the Ethics centre. */
  angle: number | null
  /** Petal keys that must be completed before this one unlocks. */
  requires: string[]
}

export const ETHICS_KEY = 'ethics'

/** Centre first, then the 9 outer petals clockwise from the top. */
export const QUEST_PETALS: QuestPetal[] = [
  {
    key: 'ethics', label: 'Ethics & Principles', short: 'Ethics', icon: '🧭', color: '#B07D2E',
    description: 'Earth care, people care, fair share — the roots every design grows from.',
    angle: null, requires: [],
  },
  {
    key: 'water', label: 'Water', short: 'Water', icon: '💧', color: '#2F6E8F',
    description: 'How water moves, is caught, stored and set free across a landscape.',
    angle: 0, requires: ['ethics'],
  },
  {
    key: 'soil', label: 'Soil & Earth', short: 'Soil', icon: '🪱', color: '#7A4A2E',
    description: 'Living soil, geology and earthworks — the ground beneath everything.',
    angle: 40, requires: ['water'],
  },
  {
    key: 'food', label: 'Food & Plants', short: 'Food', icon: '🌾', color: '#4A7C59',
    description: 'Growing, foraging and tending the plants and systems that feed us.',
    angle: 80, requires: ['soil'],
  },
  {
    key: 'buildings', label: 'Buildings & Design', short: 'Building', icon: '🏡', color: '#A9663E',
    description: 'Shelter and pattern — natural building and whole-system design.',
    angle: 120, requires: ['ethics'],
  },
  {
    key: 'tools', label: 'Tools & Technology', short: 'Tools', icon: '🔧', color: '#6E6A57',
    description: 'Appropriate tools, energy and repair — technology that serves life.',
    angle: 160, requires: ['buildings'],
  },
  {
    key: 'finance', label: 'Finance & Economics', short: 'Economy', icon: '🪙', color: '#C8913A',
    description: 'Regenerative money, exchange and enterprise beyond extraction.',
    angle: 200, requires: ['ethics'],
  },
  {
    key: 'governance', label: 'Land Tenure & Community Governance', short: 'Governance', icon: '🤝', color: '#3E7C86',
    description: 'Holding land in common and deciding together, fairly and well.',
    angle: 240, requires: ['finance'],
  },
  {
    key: 'health', label: 'Health & Wellbeing', short: 'Health', icon: '🧘', color: '#8A6F9E',
    description: 'Bodily, communal and inner health — resilience and care.',
    angle: 280, requires: ['ethics'],
  },
  {
    key: 'education', label: 'Education & Culture', short: 'Culture', icon: '📖', color: '#5E7CA3',
    description: 'Learning, story and culture — how knowledge and meaning pass on.',
    angle: 320, requires: ['ethics'],
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
 * PLACEHOLDER progress until Step 3 wires Supabase `user_quest_progress`.
 * Shows all three visual states (completed / available / locked) so the
 * flower's design language is visible in the demo.
 */
export const MOCK_PROGRESS: QuestProgress = {
  ethics:     { status: 'completed', pct: 1 },
  water:      { status: 'available', pct: 0 },
  buildings:  { status: 'available', pct: 0 },
  finance:    { status: 'available', pct: 0 },
  health:     { status: 'available', pct: 0 },
  education:  { status: 'available', pct: 0 },
  soil:       { status: 'available', pct: 0 },
  food:       { status: 'locked', pct: 0 },
  tools:      { status: 'locked', pct: 0 },
  governance: { status: 'locked', pct: 0 },
}

export function getPetalProgress(progress: QuestProgress, key: string): PetalProgress {
  return progress[key] ?? { status: 'locked', pct: 0 }
}

/** Overall bloom fraction across all 10 domains, 0..1. */
export function bloomFraction(progress: QuestProgress): number {
  const done = QUEST_PETALS.filter(p => getPetalProgress(progress, p.key).status === 'completed').length
  return done / QUEST_PETALS.length
}
