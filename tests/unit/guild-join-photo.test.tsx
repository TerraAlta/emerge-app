import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
vi.mock('@/lib/supabase', () => ({ get supabase() { return mock.client } }))
// Next's router is referentially stable; a fresh object per render would loop the page's effect.
const router = { push: vi.fn(), replace: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const existing = {
  id: 'pr1', user_id: 'u1', display_name: 'Ana', country: 'Portugal', languages: ['Português'],
  flower_petals: ['land-nature'], tagline: 'Hortas', bio: 'Bio', specialties: [], climate_zones_worked: [],
  project_scales: [], profile_photo_url: null, portfolio_urls: [],
}

describe('Guild join — photo upload vs save', () => {
  let finishUpload: () => void
  beforeEach(() => {
    mock = makeSupabaseMock({
      user: { id: 'u1' },
      tables: { guild_practitioners: { data: existing, error: null } },
      upload: () => new Promise(res => { finishUpload = () => res({ error: null }) }),
    })
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => 'uuid-1' })
  })

  it('cannot submit while the photo is still uploading (photo would be lost)', async () => {
    const { default: Page } = await import('@/app/guild/join/page')
    const { container } = render(<Page />)
    await screen.findByRole('button', { name: /submit for verification/i })
    const save = () => screen.getByRole('button', { name: /submit for verification|waiting for photo/i })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'me.jpg', { type: 'image/jpeg' })] } })
    await screen.findByText('Uploading...')
    expect(save()).toBeDisabled()
    finishUpload()
    await waitFor(() => expect(save()).not.toBeDisabled())
  })
})
