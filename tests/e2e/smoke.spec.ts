import { test, expect } from '@playwright/test'

// Collect console errors so every flow fails loudly on runtime errors.
// Known-benign: React's dev-only hydration note about the theme attribute
// set by the inline theme script before hydration.
export function watchConsole(page: import('@playwright/test').Page) {
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

test('home loads for a visitor with no console errors', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/')
  await expect(page.getByText('What is Emerge').first()).toBeVisible()
  await page.getByRole('button', { name: 'Close and start exploring' }).click()
  await expect(page.getByText('Events near you', { exact: true }).first()).toBeVisible()
  expect(errors).toEqual([])
})
