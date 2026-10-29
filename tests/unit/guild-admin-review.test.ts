/** Admin approve/reject with auth, email, Supabase mocked — nothing is sent. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
const sendEmail = vi.fn(async () => {})
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mock.client }))
vi.mock('@/lib/admin-auth', () => ({ requireAdmin: async () => ({ id: 'admin' }) }))
vi.mock('@/lib/email', () => ({ sendEmail, isEmailConfigured: () => true }))
vi.mock('@/lib/stripe', () => ({ getStripe: () => { throw new Error('not used') } }))

function failingProjectUpdate() {
  mock = makeSupabaseMock({ tables: {
    guild_projects: op => op === 'update'
      ? { data: null, error: { message: 'update failed' } }
      : { data: { id: 'pr1', client_user_id: 'c1', project_name: 'Quinta', payment_id: null }, error: null },
    guild_scoping_docs: { data: null, error: null },
  } })
  ;(mock.client.auth as any).admin = { getUserById: vi.fn(async () => ({ data: { user: { email: 'client@example.test' } } })) }
}
const call = async (path: string) => {
  const mod: any = await import(/* @vite-ignore */ path)
  return mod.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ projectId: 'pr1' }) }) as any)
}

describe.each([
  ['approve', '@/app/api/guild/admin/approve/route'],
  ['reject', '@/app/api/guild/admin/reject/route'],
])('admin %s', (_name, path) => {
  beforeEach(() => { sendEmail.mockClear(); failingProjectUpdate() })

  it('does not email the client when the project status could not be saved', async () => {
    const res = await call(path)
    expect(res.status).toBe(500)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
