import { test, expect } from '@playwright/test'

test.describe('Guild directory', () => {
  test('loads verified practitioners for a visitor', async ({ page }) => {
    await page.goto('/guild')
    await expect(page.getByRole('heading', { name: /\d+ practitioners?/ })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Loading practitioners...')).toBeHidden()
  })

  test('a failed load says so — it does not claim the Guild is empty', async ({ page }) => {
    await page.route('**/rest/v1/guild_practitioners*', route => route.abort('failed'))
    await page.goto('/guild')
    await expect(page.getByText('Loading practitioners...')).toBeHidden({ timeout: 20_000 })
    await expect(page.getByText('No practitioners verified yet', { exact: false })).toHaveCount(0)
    await expect(page.getByText(/couldn.t load/i)).toBeVisible()
  })
})
