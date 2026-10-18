import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
vi.mock('@/lib/supabase', () => ({ get supabase() { return mock.client } }))
const router = { push: vi.fn(), replace: vi.fn() }
const params = { id: 'proj1' }
const search = new URLSearchParams()
vi.mock('next/navigation', () => ({ useRouter: () => router, useParams: () => params, useSearchParams: () => search }))

const project = {
  id: 'proj1', client_user_id: 'u1', project_name: 'Quinta do Vale', status: 'delivered', country: 'Portugal',
  extracted_brief: { vision: 'Floresta comestível', values: 'regeneração, comunidade' },
}

describe('Guild project page — AI-written doc with unexpected shapes', () => {
  beforeEach(() => {
    mock = makeSupabaseMock({
      user: { id: 'u1' },
      tables: {
        guild_projects: { data: project, error: null },
        guild_scoping_docs: { data: {
          id: 'd1', project_id: 'proj1', approved_at: '2026-10-01', matched_practitioner_ids: [],
          doc_content: {
            title: 'Plano',
            design_principles: 'Observe and interact, catch and store energy', // a sentence, not a list
            suggested_phases: [{ phase_name: 'Fase 1', objectives: 'Map water', key_activities: null, practitioner_roles: 'Designer' }],
            risks_and_open_questions: 'Water rights unclear',
            practitioner_recommendations: [],
          },
        }, error: null },
        guild_practitioners: { data: [], error: null },
      },
    })
  })

  it('renders instead of crashing when lists come back as plain strings', async () => {
    const { default: Page } = await import('@/app/guild/project/[id]/page')
    render(<Page />)
    expect(await screen.findByText('Fase 1')).toBeInTheDocument()
    expect(screen.getByText(/Observe and interact/)).toBeInTheDocument()
    expect(screen.getByText(/Water rights unclear/)).toBeInTheDocument()
  })
})
