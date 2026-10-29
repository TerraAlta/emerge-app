import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

describe('SkillsScreen for a signed-in member', () => {
  const pickTeach = async () => {
    fireEvent.click(screen.getByText('Teach'))
    fireEvent.click(await screen.findByRole('button', { name: 'I have this' }))
    await new Promise(r => setTimeout(r, 20))
  }

  it('never overwrites saved skills when they failed to load', async () => {
    mock = makeSupabaseMock({
      user: { id: 'u1' },
      tables: { profiles: op => op === 'select' ? { data: null, error: { message: 'Failed to fetch' } } : { data: null, error: null } },
    })
    render(<SkillsScreen userId="u1" quests={[]} onSelectEvent={() => {}} />)
    expect(await screen.findByText(/couldn.t load your saved skills/i)).toBeInTheDocument()
    await pickTeach()
    expect(mock.calls.filter(c => c.table === 'profiles' && c.op === 'update')).toHaveLength(0)
  })

  it('saves on top of the loaded skills once they arrive', async () => {
    mock = makeSupabaseMock({
      user: { id: 'u1' },
      tables: { profiles: op => op === 'select' ? { data: { skills_have: ['host'], skills_want: [] }, error: null } : { data: null, error: null } },
    })
    render(<SkillsScreen userId="u1" quests={[]} onSelectEvent={() => {}} />)
    await screen.findByText(/1 skill added/i)
    await pickTeach()
    const update = mock.calls.find(c => c.table === 'profiles' && c.op === 'update')
    expect(update?.payload).toEqual({ skills_have: ['host', 'teach'], skills_want: [] })
  })
})
