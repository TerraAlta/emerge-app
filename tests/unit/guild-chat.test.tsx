import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
vi.mock('@/lib/supabase', () => ({ get supabase() { return mock.client } }))

import GuildChatScreen from '@/components/GuildChatScreen'

const ok = (body: any) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
const fail = (status: number, error: string) => Promise.resolve(new Response(JSON.stringify({ error }), { status }))

describe('GuildChatScreen (AI mocked)', () => {
  beforeEach(() => { mock = makeSupabaseMock({ user: { id: 'u1' } }) })

  it('a failed opening question can be retried (no empty dead-end chat)', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => fail(503, 'Guild AI is temporarily unavailable. Please try again tomorrow.'))
      .mockImplementationOnce(() => ok({ reply: 'Olá! What do you grow?' }))
    vi.stubGlobal('fetch', fetchMock)
    render(<GuildChatScreen endpoint="/api/guild/interview" userId="u1" onComplete={() => {}} />)
    await screen.findByText(/temporarily unavailable/)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Olá! What do you grow?')).toBeInTheDocument()
  })

  it('a failed answer keeps the typed text and does not show it as sent', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(() => ok({ reply: 'First question?' }))
      .mockImplementationOnce(() => fail(500, 'Request failed')))
    render(<GuildChatScreen endpoint="/api/guild/interview" userId="u1" onComplete={() => {}} />)
    await screen.findByText('First question?')
    const box = screen.getByPlaceholderText(/share your answer/i) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'Hortas comunitárias em Sintra' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Request failed')
    await waitFor(() => expect(box.value).toBe('Hortas comunitárias em Sintra'))
    expect(screen.queryAllByText('Hortas comunitárias em Sintra').filter(e => e.tagName !== 'TEXTAREA')).toHaveLength(0)
  })

  it('every request has a timeout so the spinner cannot run forever', async () => {
    const fetchMock = vi.fn(() => ok({ reply: 'Hi' }))
    vi.stubGlobal('fetch', fetchMock)
    render(<GuildChatScreen endpoint="/api/guild/interview" userId="u1" onComplete={() => {}} />)
    await screen.findByText('Hi')
    expect((fetchMock.mock.calls[0] as any[])[1].signal).toBeInstanceOf(AbortSignal)
  })
})
