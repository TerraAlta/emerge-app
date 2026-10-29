/** Submit-by-link with fetch, AI, auth and Supabase mocked — no real calls. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
let pageHtml = ''
const aiCreate = vi.fn(async () => ({ content: [{ type: 'text', text: '{"score": 80, "reasoning": "ok"}' }], usage: { input_tokens: 1, output_tokens: 1 } }))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => mock.client }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: aiCreate } } }))
vi.mock('@/lib/request-user', () => ({ getRequestUserId: async () => 'u1' }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => {}), isEmailConfigured: () => false }))
vi.mock('@/lib/notify-once', () => ({ claimNotification: async () => false }))
vi.mock('@/lib/safe-fetch', () => ({
  BlockedUrlError: class extends Error {},
  safeFetch: async () => new Response(pageHtml, { status: 200, headers: { 'content-type': 'text/html' } }),
}))

const ld = (obj: object) => `<html><head><title>Page</title><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body></body></html>`
const post = async () => {
  const { POST } = await import('@/app/api/submit-event/route')
  return POST(new Request('http://x', {
    method: 'POST',
    headers: { 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ url: 'https://www.eventbrite.pt/e/oficina-123' }),
  }) as any)
}

describe('submit event by link', () => {
  beforeEach(() => {
    aiCreate.mockClear()
    mock = makeSupabaseMock({ user: { id: 'u1' }, tables: {
      quest_submissions: { data: null, error: null, count: 0 } as any,
      quests: { data: [], error: null },
    } })
  })

  it('reads an EducationEvent (how Eventbrite labels workshops)', async () => {
    pageHtml = ld({
      '@context': 'https://schema.org', '@type': 'EducationEvent', name: 'Oficina de compostagem',
      startDate: '2030-05-10T10:00:00+01:00',
      location: { '@type': 'Place', name: 'Horta do Monte', geo: { latitude: 38.72, longitude: -9.13 } },
    })
    const res = await post()
    const body = await res.json()
    expect(res.status).toBe(200)
    const insert = mock.calls.find(c => c.table === 'quest_submissions' && c.op === 'insert')
    expect(insert?.payload?.title ?? JSON.stringify(insert?.payload)).toContain('Oficina de compostagem')
    expect(JSON.stringify(body)).not.toMatch(/couldn't find a date/i)
  })

  it('a malformed date skips the date instead of failing the whole submission', async () => {
    pageHtml = `<html><head><meta property="og:title" content="Troca de sementes"></head><body><time datetime="sábado de manhã">Sábado</time></body></html>`
    const res = await post()
    expect(res.status).not.toBe(500)
  })
})
