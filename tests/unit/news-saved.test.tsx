import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { makeSupabaseMock } from './helpers/supabase-mock'

let mock: ReturnType<typeof makeSupabaseMock>
vi.mock('@/lib/supabase', () => ({ get supabase() { return mock.client } }))
import NewsScreen from '@/components/NewsScreen'

const item = {
  id: 'n1', title: 'Hortas urbanas em Lisboa crescem', summary: 'Resumo', source_url: 'https://news.test/a',
  source_name: 'Público', source_domain: 'news.test', author: null, image_url: null,
  published_at: new Date().toISOString(), petal: 'land-nature', ai_score: 80, news_resonates: [{ count: 0 }],
}

describe('News — Saved view', () => {
  beforeEach(() => {
    mock = makeSupabaseMock({
      user: { id: 'u1' },
      tables: {
        news_items: { data: [item], error: null },
        news_resonates: { data: [], error: null },
        news_saves: (op) => op === 'delete'
          ? { data: null, error: { message: 'Failed to fetch' } }     // un-save fails
          : { data: [{ news_item_id: 'n1', saved_at: new Date().toISOString() }], error: null },
      },
    })
  })

  it('a failed un-save keeps the article in the Saved list', async () => {
    render(<NewsScreen />)
    await screen.findByText('Hortas urbanas em Lisboa crescem')
    fireEvent.click(screen.getByText(/🔖 Saved/))
    await screen.findByText('Hortas urbanas em Lisboa crescem')
    fireEvent.click(await screen.findByRole('button', { name: 'Unsave' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unsave' })).toBeInTheDocument())
    expect(screen.getByText('Hortas urbanas em Lisboa crescem')).toBeInTheDocument()
  })
})
