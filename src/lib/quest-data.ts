'use client'

/**
 * Supabase data access for the Quests section.
 * Content (learning_quests + quest_cards) is publicly readable; progress and
 * journal entries are per-user and RLS-guarded to auth.uid().
 */

import { supabase } from '@/lib/supabase'
import { QUEST_CONTENT, type Quest, type QuestCard, type CardType, type CardContent } from '@/lib/quest-content'

interface DbQuest {
  id: string
  petal_id: string
  title: string
  description: string
  order_index: number
  xp_reward: number
}
interface DbCard {
  id: string
  quest_id: string
  card_type: CardType
  content: CardContent
  order_index: number
}

/** Load every quest + its cards from Supabase, shaped as Quest[]. */
export async function fetchAllQuests(): Promise<Quest[]> {
  const [{ data: quests, error: qErr }, { data: cards, error: cErr }] = await Promise.all([
    supabase.from('learning_quests').select('*').order('order_index'),
    supabase.from('quest_cards').select('*').order('order_index'),
  ])
  if (qErr || cErr || !quests) {
    console.error('fetchAllQuests failed, using local fallback:', qErr || cErr)
    return QUEST_CONTENT
  }
  const byQuest = new Map<string, QuestCard[]>()
  for (const c of (cards ?? []) as DbCard[]) {
    const list = byQuest.get(c.quest_id) ?? []
    list.push({ id: c.id, type: c.card_type, orderIndex: c.order_index, content: c.content })
    byQuest.set(c.quest_id, list)
  }
  return (quests as DbQuest[]).map(q => ({
    id: q.id,
    petalKey: q.petal_id,
    title: q.title,
    description: q.description,
    orderIndex: q.order_index,
    xpReward: q.xp_reward,
    cards: (byQuest.get(q.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex),
  }))
}

/** The set of quest ids this user has completed. */
export async function fetchCompleted(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_quest_progress')
    .select('quest_id')
    .eq('user_id', userId)
  if (error) { console.error('fetchCompleted failed:', error); return new Set() }
  return new Set((data ?? []).map((r: { quest_id: string }) => r.quest_id))
}

/** Mark a quest complete (idempotent). */
export async function completeQuestDb(userId: string, questId: string, xp: number): Promise<void> {
  const { error } = await supabase
    .from('user_quest_progress')
    .upsert(
      { user_id: userId, quest_id: questId, xp_earned: xp },
      { onConflict: 'user_id,quest_id', ignoreDuplicates: true },
    )
  if (error) console.error('completeQuestDb failed:', error)
}

/** The user's reflection journal, keyed by card id. */
export async function fetchJournalDb(userId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('quest_journal')
    .select('card_id, entry')
    .eq('user_id', userId)
  if (error) { console.error('fetchJournalDb failed:', error); return {} }
  const out: Record<string, string> = {}
  for (const r of (data ?? []) as { card_id: string; entry: string }[]) out[r.card_id] = r.entry
  return out
}

/** Upsert a reflection entry for a card. */
export async function saveJournalDb(userId: string, cardId: string, questId: string, entry: string): Promise<void> {
  const { error } = await supabase
    .from('quest_journal')
    .upsert(
      { user_id: userId, card_id: cardId, quest_id: questId, entry, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,card_id' },
    )
  if (error) console.error('saveJournalDb failed:', error)
}
