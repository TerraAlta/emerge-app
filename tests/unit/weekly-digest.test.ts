/** Weekly digest with auth, email and Supabase mocked — nothing is sent. */
import { describe, it, expect, vi } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
const sendEmail = vi.fn(async () => ({ ok: true }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => new Proxy({}, { get: (_, k) => (mock.client as any)[k] }) }))
vi.mock('@/lib/cron-auth', () => ({ isCronAuthorized: () => true }))
vi.mock('@/lib/email', () => ({ sendEmail, isEmailConfigured: () => true }))
vi.mock('@/lib/unsubscribe-token', () => ({ generateUnsubscribeToken: () => 'tok' }))

describe('weekly digest', () => {
  it('a failed send earlier today does not block a re-run from sending', async () => {
    mock = makeSupabaseMock({ tables: {
      news_items: { data: [], error: null },
      profiles: { data: [{ id: 'u1', first_name: 'Ana', email_digest_radius_km: 25, saved_lat: 38.7, saved_lng: -9.1, saved_city: 'Lisboa' }], error: null },
      // Today's log holds one failed attempt, no successful send.
      email_digest_log: (op, _p, filters = []) => {
        if (op !== 'select') return { data: null, error: null }
        const onlySent = filters.some((f: any[]) => f[1] === 'status' && f[2] === 'sent')
        return { data: onlySent ? [] : [{ id: 'failed-row' }], error: null }
      },
    } })
    ;(mock.client.auth as any).admin = { getUserById: async () => ({ data: { user: { email: 'ana@example.test' } } }) }
    mock.client.rpc = vi.fn(async () => ({ data: [{
      title: 'Oficina de compostagem', category: 'learning', starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      address: 'Lisboa', distance_km: 2, source_name: 'Emerge', source_url: null,
    }], error: null })) as any
    const { GET } = await import('@/app/api/cron/weekly-digest/route')
    const res = await GET(new Request('http://x') as any)
    const body = await res.json()
    expect(body.sent).toBe(1)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
})
