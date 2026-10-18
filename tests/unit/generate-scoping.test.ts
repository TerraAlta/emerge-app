/**
 * /api/guild/generate-scoping with the AI, Supabase, admin auth and email all
 * mocked — no real AI calls, no database, no mail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
let aiText = ''
const logApiUsage = vi.fn(async () => {})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => mock.client }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: vi.fn(async () => ({
    content: [{ type: 'text', text: aiText }], stop_reason: 'end_turn',
    usage: { input_tokens: 5000, output_tokens: 3000 },
  })) } },
}))
vi.mock('@/lib/admin-auth', () => ({ requireAdmin: async () => ({ userId: 'admin', email: 'a@test' }) }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ ok: true })), isEmailConfigured: () => false }))
vi.mock('@/lib/guild-costs', async () => {
  const real = await vi.importActual<any>('@/lib/guild-costs')
  return { ...real, isDailyLimitReached: async () => false, logApiUsage }
})

const project = { id: 'proj1', client_user_id: 'client1', project_name: 'Quinta', extracted_brief: { country: 'Portugal', suggested_petals: ['land-nature'], languages: ['Portuguese'] } }
const practitioner = { id: 'prac1', display_name: 'Ana', country: 'Portugal', languages: ['Portuguese'], flower_petals: ['land-nature'], specialties: [], climate_zones_worked: [], project_scales: [] }

async function call() {
  const { POST } = await import('@/app/api/guild/generate-scoping/route')
  const req = new Request('http://x/api/guild/generate-scoping', { method: 'POST', body: JSON.stringify({ projectId: 'proj1' }) })
  return POST(req as any)
}

describe('generate-scoping (AI mocked)', () => {
  beforeEach(() => {
    logApiUsage.mockClear()
    mock = makeSupabaseMock({
      tables: {
        guild_projects: { data: project, error: null },
        guild_scoping_docs: (op) => op === 'insert' ? { data: { id: 'doc1' }, error: null } : { data: [], error: null },
        guild_practitioners: { data: [practitioner], error: null },
      },
    })
  })

  it('counts AI spend even when the reply cannot be parsed (daily cap stays honest)', async () => {
    aiText = 'Sorry, here is a draft: {"title": "unterminated'
    const res = await call()
    expect(res.status).toBe(500)
    expect(logApiUsage).toHaveBeenCalledTimes(1)
  })

  it('accepts JSON followed by a trailing sentence', async () => {
    aiText = '{"title":"Plano","practitioner_recommendations":[{"practitioner_id":"prac1","why_this_match":"local"}]}\nHope this helps!'
    const res = await call()
    expect(res.status).toBe(200)
    expect(logApiUsage).toHaveBeenCalledTimes(1)
  })
})
