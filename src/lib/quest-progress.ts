/**
 * Local quest-progress store — a stand-in until Step 3 wires Supabase
 * `user_quest_progress`. Persists completed quests + reflection-journal
 * entries to localStorage so progress survives a reload during the demo.
 */

import { QUEST_PETALS, MOCK_PROGRESS, getPetalProgress, type QuestProgress } from '@/lib/quest-petals'
import { QUEST_CONTENT, questsForPetal, getQuest } from '@/lib/quest-content'

const COMPLETED_KEY = 'emerge-quest-completed'
const JOURNAL_KEY = 'emerge-quest-journal'

export function loadCompleted(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(COMPLETED_KEY)
    return new Set<string>(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

export function saveCompleted(ids: Set<string>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(COMPLETED_KEY, JSON.stringify([...ids]))
}

/** Reflection journal — keyed by card id. */
export type Journal = Record<string, string>

export function loadJournal(): Journal {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(JOURNAL_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveJournalEntry(cardId: string, text: string) {
  if (typeof window === 'undefined') return
  const j = loadJournal()
  j[cardId] = text
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(j))
}

/** Total XP from every completed quest. */
export function totalXp(completed: Set<string>): number {
  return QUEST_CONTENT.reduce((sum, q) => (completed.has(q.id) ? sum + q.xpReward : sum), 0)
}

/**
 * Build the flower's per-petal progress from completed quests.
 * Petals with authored content derive their status/pct from real completion;
 * petals without content fall back to the mock demo state.
 */
export function deriveProgress(completed: Set<string>): QuestProgress {
  const out: QuestProgress = {}
  for (const petal of QUEST_PETALS) {
    const quests = questsForPetal(petal.key)
    const base = getPetalProgress(MOCK_PROGRESS, petal.key)
    if (quests.length === 0) {
      out[petal.key] = base
      continue
    }
    const done = quests.filter(q => completed.has(q.id)).length
    const pct = done / quests.length
    const status = done === quests.length
      ? 'completed'
      : base.status === 'locked' ? 'locked' : 'available'
    out[petal.key] = { status, pct }
  }
  return out
}

/** How many quests in a petal are completed, for the petal progress bar. */
export function petalQuestCounts(petalKey: string, completed: Set<string>) {
  const quests = questsForPetal(petalKey)
  const done = quests.filter(q => completed.has(q.id)).length
  return { done, total: quests.length }
}

export { getQuest }
