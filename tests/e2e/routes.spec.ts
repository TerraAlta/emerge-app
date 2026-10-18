import { test, expect } from '@playwright/test'
import { watchConsole } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('emerge_onboarding_seen', '1')
    localStorage.setItem('emerge_install_tip_seen', '1')
    localStorage.setItem('emerge-location', JSON.stringify({ lat: 38.7223, lng: -9.1393, name: 'Lisbon', countryCode: 'PT', source: 'manual' }))
  })
})

const ROUTES = ['/', '/quests', '/guild', '/guild/pitches', '/privacy', '/reset-password', '/admin', '/admin/guild', '/admin/submissions']

for (const path of ROUTES) {
  test(`${path} loads for a visitor without console errors or sideways scroll`, async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(800)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
