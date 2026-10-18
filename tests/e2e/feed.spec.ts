import { test, expect } from '@playwright/test'

// Start as a returning visitor who already picked Lisbon (no geolocation prompt).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('emerge_onboarding_seen', '1')
    localStorage.setItem('emerge_install_tip_seen', '1')
    localStorage.setItem('emerge-location', JSON.stringify({ lat: 38.7223, lng: -9.1393, name: 'Lisbon', countryCode: 'PT', source: 'manual' }))
  })
})

test('feed shows events for a saved location', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Lisbon').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('No events near you yet.')).toHaveCount(0)
})

test('a failed feed load says so instead of "No events near you yet"', async ({ page }) => {
  await page.route('**/rest/v1/rpc/nearby_quests*', r => r.abort('failed'))
  await page.route('**/rest/v1/rpc/national_quests*', r => r.abort('failed'))
  await page.goto('/')
  await expect(page.getByText(/couldn.t load events/i)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('No events near you yet.')).toHaveCount(0)
})
