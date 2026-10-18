/** Guild extract routes with AI, auth, Supabase mocked — no real calls. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
let aiText = ''
const logApiUsage = vi.fn(async () => {})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => mock.client }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: vi.fn(async () => ({
    content: [{ type: 'text', text: aiText }], usage: { input_tokens: 900, output_tokens: 600 },
  })) } },
}))
vi.mock('@/lib/request-user', async () => {
  const real = await vi.importActual<any>('@/lib/request-user')
  return { ...real, getRequestUserId: async () => 'u1', ownsRow: async () => true }
})
vi.mock('@/lib/guild-costs', async () => {
  const real = await vi.importActual<any>('@/lib/guild-costs')
  return { ...real, isDailyLimitReached: async () => false, isUserDailyLimitReached: async () => false, logApiUsage }
})

const transcript = [{ role: 'assistant', content: 'Olá?' }, { role: 'user', content: 'Faço hortas em Sintra.' }]
const routes = [
  { name: 'extract', path: '@/app/api/guild/extract/route', body: { practitionerId: 'p1', transcript } },
  { name: 'extract-brief', path: '@/app/api/guild/extract-brief/route', body: { projectId: 'pr1', transcript } },
]

describe.each(routes)('$name (AI mocked)', ({ path, body }) => {
  beforeEach(() => {
    logApiUsage.mockClear()
    mock = makeSupabaseMock({ user: { id: 'u1' }, tables: {
      guild_practitioners: { data: { id: 'p1', user_id: 'u1' }, error: null },
      guild_projects: { data: { id: 'pr1', client_user_id: 'u1' }, error: null },
    } })
  })
  const call = async () => {
    const mod: any = await import(/* @vite-ignore */ path)
    return mod.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as any)
  }

  it('logs AI spend even when the reply cannot be parsed', async () => {
    aiText = 'not json at all'
    const res = await call()
    expect(res.status).toBe(500)
    expect(logApiUsage).toHaveBeenCalledTimes(1)
  })

  it('accepts JSON with a trailing sentence, logging spend once', async () => {
    aiText = '{"tagline":"Hortas","bio":"Bio"}\nLet me know!'
    const res = await call()
    expect(res.status).toBe(200)
    expect(logApiUsage).toHaveBeenCalledTimes(1)
  })
})
