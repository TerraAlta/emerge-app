import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useBackToClose } from '@/hooks/useBackToClose'

// The post form needs a signed-in account, so the e2e suite can't reach it;
// this checks the shared behaviour it relies on.
describe('useBackToClose', () => {
  it('Back closes the open view and stays on the page', async () => {
    const onClose = vi.fn()
    const startLength = window.history.length
    renderHook(() => useBackToClose(true, onClose, 'testPost'))
    expect(window.history.length).toBe(startLength + 1)
    expect(window.history.state?.testPost).toBe(true)
    await act(async () => {
      window.history.back()
      await new Promise(r => window.addEventListener('popstate', r, { once: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closing another way (e.g. the form succeeds) removes the history entry', async () => {
    const back = vi.spyOn(window.history, 'back')
    const { rerender } = renderHook(({ open }) => useBackToClose(open, () => {}, 'testPost2'), { initialProps: { open: true } })
    rerender({ open: false })
    expect(back).toHaveBeenCalled()
    back.mockRestore()
  })
})
