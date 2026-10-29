'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Make the browser/phone Back button close an in-page view (an overlay or a
 * step that isn't its own route) instead of leaving the page.
 *
 * While `open` is true the view owns one history entry, marked with `key`.
 * Back pops it and `onClose` runs. Nested views use different keys: each
 * entry carries its parents' keys too, so one Back closes only the top view.
 * Call the returned `back()` from in-app back buttons so no stale entry is
 * left behind; if the view closes some other way (e.g. a form succeeds), its
 * entry is removed automatically.
 */
export function useBackToClose(open: boolean, onClose: () => void, key: string) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Set during unmount (this effect's cleanup runs before the one below), so
  // leaving the page while a view is open doesn't trigger history.back().
  const unmountingRef = useRef(false)
  useEffect(() => () => { unmountingRef.current = true }, [])

  useEffect(() => {
    if (!open) return
    if (!window.history.state?.[key]) {
      window.history.pushState({ ...window.history.state, [key]: true }, '')
    }
    const onPop = () => {
      // Popped past our entry (it's no longer in the current state) → close.
      if (!window.history.state?.[key]) closeRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Closed without Back (in-app button handled elsewhere, success, etc.):
      // drop our entry so the next Back isn't swallowed.
      if (!unmountingRef.current && window.history.state?.[key]) window.history.back()
    }
  }, [open, key])

  return useCallback(() => {
    if (window.history.state?.[key]) window.history.back()
    else closeRef.current()
  }, [key])
}
