import { test, expect } from '@playwright/test'
import { watchConsole } from './helpers'

// Every Supabase response delayed 4 s: screens must show a loading state,
// never a blank page or a premature empty state, then finish normally.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (location.hostname !== 'localhost') return
    localStorage.setItem('emerge_onboarding_seen', '1')
    localStorage.setItem('emerge_install_tip_seen', '1')
    localStorage.setItem('emerge-location', JSON.stringify({ lat: 38.7223, lng: -9.1393, name: 'Lisbon', countryCode: 'PT', source: 'manual' }))
  })
  await page.route(/supabase\.co\/(rest|auth)\//, async route => {
    await new Promise(r => setTimeout(r, 4000))
    await route.continue()
  })
})

test('Guild directory shows loading, not "no practitioners", on a slow connection', async ({ page }) => {
  const errors = watchConsole(page)
  const t0 = Date.now()
  await page.goto('/guild')
  await expect(page.getByText('Loading practitioners...')).toBeVisible()
  // While loading, the headline must not claim "0 practitioners".
  await expect(page.getByRole('heading', { name: /^0 practitioners$/ })).toHaveCount(0)
  await expect(page.getByText('No practitioners verified yet', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /read more/i }).first()).toBeVisible({ timeout: 30_000 })
  expect(Date.now() - t0, 'delay really applied').toBeGreaterThan(3500)
  expect(errors).toEqual([])
})

test('Feed never flashes "No events near you yet" before data arrives', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/')
  await page.waitForTimeout(1500)
  await expect(page.getByText('No events near you yet.')).toHaveCount(0)
  // The counter must not claim zero events while they're still loading.
  const nearbyValue = await page.evaluate(() => {
    const label = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^(Events nearby|Nearest events)$/.test(e.textContent?.trim() || ''))
    return label?.previousElementSibling?.textContent?.trim() ?? label?.parentElement?.firstElementChild?.textContent?.trim()
  })
  expect(nearbyValue, 'Events nearby counter while loading').not.toBe('0')
  await expect(page.getByText(/Events nearby/).first()).toBeVisible({ timeout: 30_000 })
  expect(errors).toEqual([])
})

test('Learning section shows the flower once slow content arrives', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/quests')
  await expect(page.getByRole('button', { name: /Foundations/ })).toBeVisible({ timeout: 30_000 })
  expect(errors).toEqual([])
})
