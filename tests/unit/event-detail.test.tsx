import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
vi.mock('@/lib/supabase', () => ({ get supabase() { return mock.client } }))
vi.mock('next/dynamic', () => ({ default: () => () => <div>MAP</div> }))
import EventDetail from '@/components/EventDetail'

const quest = {
  id: 'q1', title: 'Troca de sementes', description: 'Traz sementes', category: 'food', address: 'Sintra',
  starts_at: '2030-05-01T10:00:00Z', ends_at: null, source_url: null, source_name: 'user', ai_score: 80,
  ai_reasoning: '', image_url: null, max_participants: null, lat: 38.8, lng: -9.38, distance_km: 2,
}

describe('Event detail — joining', () => {
  beforeEach(() => {
    mock = makeSupabaseMock({
      user: { id: 'u1' },
      tables: {
        quest_participants: (op) => op === 'insert'
          ? { data: null, error: { code: '42501', message: 'permission denied' } }
          : { data: [], error: null },
        quest_participants_public: { data: [], error: null },
      },
    })
  })

  it('tells the user when joining failed instead of silently doing nothing', async () => {
    render(<EventDetail quest={quest as any} userId="u1" onBack={() => {}} onNeedAuth={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /join event/i }))
    expect(await screen.findByText(/couldn.t join/i)).toBeInTheDocument()
  })
})
