/** Connect Luma with Luma, AI, auth and Supabase mocked — no real calls. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
const importLumaEvents = vi.fn(async () => ({ inserted: 1, filtered: 0, rejectedIds: [] }))

// The route builds its client once at import: delegate to whichever mock is current.
vi.mock('@supabase/supabase-js', () => ({ createClient: () => new Proxy({}, { get: (_, k) => (mock.client as any)[k] }) }))
vi.mock('@/lib/request-user', () => ({ getRequestUserId: async () => 'u1' }))
vi.mock('@/lib/crypto', () => ({ encrypt: (s: string) => `enc:${s}` }))
vi.mock('@/lib/luma', () => ({
  fetchLumaEvents: async () => [{ event: { host: { name: 'Horta Viva' } } }],
  importLumaEvents,
  storedKey: () => 'other-key',
}))

const post = async () => {
  const { POST } = await import('@/app/api/connect-luma/route')
  return POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ api_key: 'secret-test-key' }) }) as any)
}

describe('connect Luma', () => {
  beforeEach(() => importLumaEvents.mockClear())

  it('does not say "connected" when the calendar could not be saved', async () => {
    mock = makeSupabaseMock({ tables: {
      connected_calendars: op => op === 'insert'
        ? { data: null, error: { message: 'permission denied' } }
        : { data: [], error: null },
    } })
    const res = await post()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/couldn't save/i)
    expect(importLumaEvents).not.toHaveBeenCalled()
  })

  it('connects and imports when the save works', async () => {
    mock = makeSupabaseMock({ tables: {
      connected_calendars: op => op === 'insert' ? { data: { id: 'cal1' }, error: null } : { data: [], error: null },
    } })
    const res = await post()
    expect(res.status).toBe(200)
    expect(importLumaEvents).toHaveBeenCalledTimes(1)
  })
})
