import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
vi.mock('@/lib/supabase', () => ({ get supabase() { return mock.client } }))
// Maps are Leaflet (no jsdom); stand-ins that place a pin in Lisbon.
vi.mock('next/dynamic', () => ({
  default: () => (props: any) => (
    <button type="button" onClick={() => (props.onConfirm ?? props.onPin)?.({ lat: 38.72, lng: -9.14 })}>MOCK_MAP</button>
  ),
}))
import PostEvent from '@/components/PostEvent'

function fill(label: string | RegExp, value: string, container: HTMLElement, selector?: string) {
  const el = selector ? container.querySelector(selector) as HTMLInputElement : screen.getByPlaceholderText(label)
  fireEvent.change(el, { target: { value } })
}

describe('Post an event', () => {
  beforeEach(() => { mock = makeSupabaseMock({ user: { id: 'u1' }, tables: { quests: { data: null, error: null } } }) })

  it('refuses a date in the past instead of saving an event nobody will ever see', async () => {
    const onSuccess = vi.fn()
    const { container } = render(<PostEvent userId="u1" onBack={() => {}} onSuccess={onSuccess} />)
    fill(/Food forest harvest/, 'Plantação de árvores', container)
    fireEvent.click(screen.getByText('Select event type(s)'))
    fireEvent.click(screen.getByText(/Harvest/))
    fill(/Describe the event/, 'Trazer luvas', container)
    fill('', '2020-03-01', container, 'input[type="date"]')
    fill('', '10:00', container, 'input[type="time"]')
    fill(/Community garden, park name/, 'Parque da Pena', container)
    fireEvent.click(screen.getByText('MOCK_MAP'))  // open map
    fireEvent.click(screen.getAllByText('MOCK_MAP').pop()!) // confirm pin
    fireEvent.submit(container.querySelector('form')!)
    expect(await screen.findByText(/future/i)).toBeInTheDocument()
    expect(mock.calls.filter(c => c.table === 'quests' && c.op === 'insert')).toHaveLength(0)
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('phone Back on the pin map closes only the map and keeps what was typed', async () => {
    const onBack = vi.fn()
    window.history.pushState({ before: true }, '') // where the form was opened from
    const { container } = render(<PostEvent userId="u1" onBack={onBack} onSuccess={() => {}} />)
    fill(/Food forest harvest/, 'Plantação de árvores', container)
    fireEvent.click(screen.getByText('MOCK_MAP'))  // open the full-screen map
    expect(screen.getAllByText('MOCK_MAP')).toHaveLength(2)
    await act(async () => {
      window.history.back()
      await new Promise(r => setTimeout(r, 50))
    })
    expect(screen.getAllByText('MOCK_MAP')).toHaveLength(1)
    expect(screen.getByPlaceholderText(/Food forest harvest/)).toHaveValue('Plantação de árvores')
    expect(onBack).not.toHaveBeenCalled()
  })
})
