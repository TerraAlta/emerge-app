/**
 * Quest-progress helpers.
 *
 * Signed-in users' progress + journal live in Supabase (see quest-data.ts).
 * Anonymous users fall back to localStorage so they can still play and keep
 * progress locally. The pure derivation helpers below work off whatever quest
 * list + completed-set they're given, so they serve both paths.
 */

import { QUEST_PETALS, type QuestProgress, type PetalStatus } from '@/lib/quest-petals'
import type { Quest } from '@/lib/quest-content'

const COMPLETED_KEY = 'emerge-quest-completed'
const JOURNAL_KEY = 'emerge-quest-journal'

// ── Anonymous (localStorage) persistence ─────────────────────────────────────
export function loadCompleted(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(COMPLETED_KEY)
    return new Set<string>(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

export function saveCompleted(ids: Set<string>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(COMPLETED_KEY, JSON.stringify([...ids]))
}

export type Journal = Record<string, string>

export function loadJournal(): Journal {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(JOURNAL_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveJournalEntry(cardId: string, text: string) {
  if (typeof window === 'undefined') return
  const j = loadJournal()
  j[cardId] = text
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(j))
}

// ── Pure derivations (work for both signed-in and anon) ──────────────────────
export function questsForPetalIn(allQuests: Quest[], petalKey: string): Quest[] {
  return allQuests.filter(q => q.petalKey === petalKey).sort((a, b) => a.orderIndex - b.orderIndex)
}

/** Total XP from every completed quest. */
export function totalXp(completed: Set<string>, allQuests: Quest[]): number {
  return allQuests.reduce((sum, q) => (completed.has(q.id) ? sum + q.xpReward : sum), 0)
}

/**
 * Build the flower's per-petal progress from real completion + the prerequisite
 * chain. A petal is:
 *   - completed  → it has quests and every one is done
 *   - available  → all the petals it `requires` are completed (ethics needs none)
 *   - locked     → otherwise
 * So a fresh user starts with only the Foundations centre open, and the flower
 * unlocks outward as each domain blooms.
 */
export function deriveProgress(completed: Set<string>, allQuests: Quest[]): QuestProgress {
  const petalCompleted = (key: string): boolean => {
    const qs = questsForPetalIn(allQuests, key)
    return qs.length > 0 && qs.every(q => completed.has(q.id))
  }
  const out: QuestProgress = {}
  for (const petal of QUEST_PETALS) {
    const quests = questsForPetalIn(allQuests, petal.key)
    const done = quests.filter(q => completed.has(q.id)).length
    const pct = quests.length ? done / quests.length : 0
    let status: PetalStatus
    if (quests.length > 0 && done === quests.length) {
      status = 'completed'
    } else if (petal.requires.every(petalCompleted)) {
      status = 'available'
    } else {
      status = 'locked'
    }
    out[petal.key] = { status, pct }
  }
  return out
}
