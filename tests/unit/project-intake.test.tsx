import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
vi.mock('@/lib/supabase', () => ({ get supabase() { return mock.client } }))
const router = { push: vi.fn(), replace: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }))
// The brief form is long; a stand-in that submits a filled brief straight away.
vi.mock('@/components/ManualBriefForm', () => ({
  default: (p: any) => <button onClick={() => p.onSubmit({ project_name: 'Quinta da Aveleira', country: 'Portugal', tagline: 'Floresta comestível', values: ['regeneração'] })}>MOCK_SUBMIT_BRIEF</button>,
}))

describe('Guild project intake — brief must be saved before submitting', () => {
  let briefSaved: boolean
  let updateCalls: number
  beforeEach(() => {
    briefSaved = false
    updateCalls = 0
    router.push.mockClear()
    mock = makeSupabaseMock({
      user: { id: 'u1' },
      tables: {
        guild_projects: (op, payload) => {
          if (op === 'insert') return { data: { id: 'proj1' }, error: null }
          if (op === 'update' && payload?.extracted_brief) {
            updateCalls++
            // First save fails (flaky connection); a later save succeeds.
            if (updateCalls === 1) return { data: null, error: { message: 'Failed to fetch' } }
            briefSaved = true
          }
          return { data: null, error: null }
        },
      },
    })
    // The real server refuses to submit a project whose brief isn't saved.
    vi.stubGlobal('fetch', vi.fn(async () => briefSaved
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response(JSON.stringify({ error: 'Intake not complete yet' }), { status: 400 })))
  })

  it('a brief that failed to save is saved again on submit, so submission succeeds', async () => {
    const { default: Page } = await import('@/app/guild/project/new/page')
    render(<Page />)
    fireEvent.click(await screen.findByRole('button', { name: 'Begin' }))
    fireEvent.change(await screen.findByPlaceholderText('e.g. Quinta da Aveleira'), { target: { value: 'Quinta da Aveleira' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. Portugal'), { target: { value: 'Portugal' } })
    fireEvent.click(screen.getByText('Continue to intake →'))
    fireEvent.click(await screen.findByText('Fill a form myself'))
    fireEvent.click(await screen.findByText('MOCK_SUBMIT_BRIEF'))
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for scoping' }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/guild/project/proj1?submitted=1'))
  })
})
