import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
vi.mock('@/lib/supabase', () => ({ get supabase() { return mock.client } }))
import DigestSettings from '@/components/DigestSettings'

describe('Settings — name change', () => {
  beforeEach(() => {
    mock = makeSupabaseMock({
      user: { id: 'u1' },
      tables: {
        profiles: (op) => op === 'update'
          ? { data: null, error: { message: 'permission denied' } }
          : { data: { first_name: 'Ana', email_digest_enabled: false, email_digest_radius_km: 25 }, error: null },
      },
    })
  })

  it('tells the user when the new name did not save', async () => {
    render(<DigestSettings userId="u1" onClose={() => {}} />)
    const input = await screen.findByDisplayValue('Ana')
    fireEvent.change(input, { target: { value: 'Ana Conceição' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText(/couldn.t save/i)).toBeInTheDocument()
  })
})
