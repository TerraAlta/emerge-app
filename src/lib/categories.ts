export const CATEGORIES = {
  nature:    { label: 'Nature',    color: '#4A7C59', emoji: '\u{1F33F}' },
  food:      { label: 'Food',      color: '#C8913A', emoji: '\u{1F37D}\u{FE0F}' },
  craft:     { label: 'Craft',     color: '#B87333', emoji: '\u{1FAB5}' },
  community: { label: 'Community', color: '#5B8FA8', emoji: '\u{1F91D}' },
  wellness:  { label: 'Wellness',  color: '#9B72AA', emoji: '\u{1F9D8}' },
  learning:  { label: 'Learning',  color: '#6B7DB3', emoji: '\u{1F4D6}' },
  play:      { label: 'Play',      color: '#BF360C', emoji: '\u{1F3B6}' },
  make:      { label: 'Make',      color: '#6D4C2A', emoji: '\u{1F3A8}' },
} as const

export type CategoryKey = keyof typeof CATEGORIES
