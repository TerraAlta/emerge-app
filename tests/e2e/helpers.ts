import type { Page } from '@playwright/test'

// Collect console errors so every flow fails loudly on runtime errors.
// Known-benign: React's dev-only hydration note about the theme attribute
// set by the inline theme script before hydration.
export function watchConsole(page: Page) {
  const errors: string[] = []
  page.on('console', m => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/Extra attributes from the server: %s%s data-theme/.test(t)) return
    errors.push(t)
  })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  return errors
}
