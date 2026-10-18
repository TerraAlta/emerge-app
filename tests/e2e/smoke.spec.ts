import { test, expect } from '@playwright/test'
import { watchConsole } from './helpers'

test('home loads for a visitor with no console errors', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/')
  await expect(page.getByText('What is Emerge').first()).toBeVisible()
  await page.getByRole('button', { name: 'Close and start exploring' }).click()
  await expect(page.getByText('Events near you', { exact: true }).first()).toBeVisible()
  expect(errors).toEqual([])
})
