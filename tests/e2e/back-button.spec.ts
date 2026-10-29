import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (location.hostname !== 'localhost') return
    localStorage.setItem('emerge_onboarding_seen', '1')
    localStorage.setItem('emerge_install_tip_seen', '1')
    localStorage.setItem('emerge-location', JSON.stringify({ lat: 38.7223, lng: -9.1393, name: 'Lisbon', countryCode: 'PT', source: 'manual' }))
  })
})

test('phone Back closes an open event instead of leaving the feed', async ({ page }) => {
  await page.goto('/privacy')            // where the visitor came from
  await page.goto('/')
  // The nearest event's card (the list marks it "Closest to you").
  const card = page.locator('div.cursor-pointer', { has: page.getByText('Closest to you') }).first()
  await card.waitFor({ timeout: 20_000 })
  await card.click()
  await expect(page.getByRole('button', { name: /join event|joined|event full/i })).toBeVisible({ timeout: 10_000 })
  await page.goBack()
  await page.waitForTimeout(800)
  expect(new URL(page.url()).pathname, 'still in the app feed').toBe('/')
  await expect(page.getByText('Events near you', { exact: true }).first()).toBeVisible()
})

test('the in-app back arrow closes the event without leaving a stale history step', async ({ page }) => {
  await page.goto('/privacy')
  await page.goto('/')
  const card = page.locator('div.cursor-pointer', { has: page.getByText('Closest to you') }).first()
  await card.waitFor({ timeout: 20_000 })
  await card.click()
  await expect(page.getByRole('button', { name: /join event|joined|event full/i })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /back/i }).first().click()
  await expect(page.getByText('Events near you', { exact: true }).first()).toBeVisible()
  // One more Back should now leave the feed (no leftover entry to swallow it).
  await page.goBack()
  await page.waitForTimeout(800)
  expect(new URL(page.url()).pathname).toBe('/privacy')
})
