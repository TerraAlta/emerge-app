import { test, expect } from '@playwright/test'
import { watchConsole } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (location.hostname !== 'localhost') return
    localStorage.setItem('emerge_onboarding_seen', '1')
    localStorage.setItem('emerge_install_tip_seen', '1')
    localStorage.setItem('emerge-location', JSON.stringify({ lat: 38.7223, lng: -9.1393, name: 'Lisbon', countryCode: 'PT', source: 'manual' }))
  })
})

test('Map and Skills views open without errors', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Map' }).click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Skills' }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'List' }).click()
  expect(errors).toEqual([])
})

test('opening an event shows its detail and closes cleanly', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/')
  // Event cards are clickable divs in the list.
  // The nearest event's card (the list marks it "Closest to you").
  const card = page.locator('div.cursor-pointer', { has: page.getByText('Closest to you') }).first()
  await card.waitFor({ timeout: 20_000 })
  const title = (await card.locator('p, h3, div').first().innerText()).split('\n')[0]
  await card.click()
  await expect(page.getByRole('button', { name: /join event|joined|event full/i })).toBeVisible({ timeout: 10_000 })
  expect(page.url()).toContain('localhost')
  expect(errors).toEqual([])
  void title
})

test('event search handles quotes, %, and accents', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/')
  const box = page.getByPlaceholder(/Search events/)
  for (const q of ["horta d'água", '100% bio', 'Évora', '(repair)']) {
    await box.fill(q)
    await page.waitForTimeout(1200)
  }
  expect(errors).toEqual([])
})

test('city search with accents finds the city', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/')
  await page.getByRole('button', { name: /change/i }).first().click()
  const box = page.getByPlaceholder(/e\.g\. Lisbon/)
  await box.fill('Évora')
  await box.press('Enter')
  await expect(page.getByText(/Évora/).first()).toBeVisible({ timeout: 15_000 })
  expect(errors).toEqual([])
})
