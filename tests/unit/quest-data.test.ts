import { describe, it, expect, vi } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
vi.mock('@/lib/supabase', () => ({ get supabase() { return mock.client } }))
import { fetchAllQuests } from '@/lib/quest-data'

describe('fetchAllQuests', () => {
  it('leaves out a quest that has no cards yet', async () => {
    mock = makeSupabaseMock({
      tables: {
        learning_quests: { data: [
          { id: 'q1', petal_id: 'ethics', title: 'Ready', description: '', order_index: 0, xp_reward: 10 },
          { id: 'q2', petal_id: 'ethics', title: 'Draft', description: '', order_index: 1, xp_reward: 10 },
        ], error: null },
        quest_cards: { data: [
          { id: 'c1', quest_id: 'q1', card_type: 'concept', content: { title: 't', body: 'b' }, order_index: 0 },
        ], error: null },
      },
    })
    const { quests, offline } = await fetchAllQuests()
    expect(offline).toBe(false)
    expect(quests.map(q => q.title)).toEqual(['Ready'])
  })
})
