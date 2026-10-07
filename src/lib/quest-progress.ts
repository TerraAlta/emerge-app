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

// ── localStorage persistence ─────────────────────────────────────────────────
// `scope` = a user id: signed-in users keep a per-user backup copy (so a save
// that fails isn't lost, and two people sharing a browser never mix). No
// scope = the anonymous copy, which is migrated into the account once on
// sign-in and then cleared (see clearAnonymousProgress).
const keyFor = (base: string, scope?: string | null) => (scope ? `${base}:${scope}` : base)

export function loadCompleted(scope?: string | null): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(keyFor(COMPLETED_KEY, scope))
    return new Set<string>(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

export function saveCompleted(ids: Set<string>, scope?: string | null) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(keyFor(COMPLETED_KEY, scope), JSON.stringify([...ids])) } catch { /* storage full/blocked */ }
}

export type Journal = Record<string, string>

export function loadJournal(scope?: string | null): Journal {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(keyFor(JOURNAL_KEY, scope))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveJournalEntry(cardId: string, text: string, scope?: string | null) {
  if (typeof window === 'undefined') return
  const j = loadJournal(scope)
  j[cardId] = text
  try { localStorage.setItem(keyFor(JOURNAL_KEY, scope), JSON.stringify(j)) } catch { /* storage full/blocked */ }
}

/** Forget the signed-out copy once it has been moved into an account. */
export function clearAnonymousProgress() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(COMPLETED_KEY)
    localStorage.removeItem(JOURNAL_KEY)
  } catch { /* ignore */ }
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
