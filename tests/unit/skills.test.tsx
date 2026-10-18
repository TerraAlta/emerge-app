import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
vi.mock('@/lib/supabase', () => ({ get supabase() { return mock.client } }))
import SkillsScreen from '@/components/SkillsScreen'

describe('SkillsScreen for a visitor (no account)', () => {
  beforeEach(() => { mock = makeSupabaseMock({ user: null }) })

  it('does not query or write profiles with an empty user id', async () => {
    render(<SkillsScreen userId="" quests={[]} onSelectEvent={() => {}} />)
    await new Promise(r => setTimeout(r, 50))
    expect(mock.calls.filter(c => c.table === 'profiles')).toHaveLength(0)
  })

  it('tells the visitor their skills are not saved without an account', () => {
    render(<SkillsScreen userId="" quests={[]} onSelectEvent={() => {}} />)
    expect(screen.getByText(/sign in to save/i)).toBeInTheDocument()
  })
})
