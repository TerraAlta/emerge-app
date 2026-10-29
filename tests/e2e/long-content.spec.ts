import { test, expect } from '@playwright/test'
import { watchConsole } from './helpers'

const LONG = 'Associação-de-Agroecologia-e-Permacultura-da-Serra-de-Sintra-e-Arredores-Unidos'
const longBio = ('Conceição trabalha com hortas comunitárias, compostagem e água. ').repeat(30)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (location.hostname !== 'localhost') return
    localStorage.setItem('emerge_onboarding_seen', '1')
    localStorage.setItem('emerge_install_tip_seen', '1')
    localStorage.setItem('emerge-location', JSON.stringify({ lat: 38.7223, lng: -9.1393, name: 'Lisbon', countryCode: 'PT', source: 'manual' }))
  })
})

async function noOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(1)
}

test('Guild directory copes with very long names, taglines and bios', async ({ page }) => {
  const errors = watchConsole(page)
  await page.route('**/rest/v1/guild_practitioners*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{
      id: 'x1', display_name: LONG, tagline: LONG + ' ' + LONG, bio: longBio, country: 'Portugal', region: LONG,
      languages: ['Português', 'English', 'Español', 'Français'], years_experience: 25, pdc_certified: true,
      advanced_certifications: LONG, flower_petals: ['land-nature', 'building-technology'], specialties: [LONG, 'Compostagem'],
      climate_zones_worked: ['Mediterranean'], project_scales: ['Farm (5-50ha)'], rate_range: '€50–€80/h',
      availability_status: 'available', profile_photo_url: null, portfolio_urls: [{ label: 'website', url: 'https://example.org/' + LONG }],
    }]),
  }))
  await page.goto('/guild')
  await expect(page.getByRole('heading', { name: '1 practitioner' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /read more/i }).click()
  await noOverflow(page)
  expect(errors).toEqual([])
})

test('Feed copes with a very long event title and address', async ({ page }) => {
  const errors = watchConsole(page)
  const ev = {
    id: '00000000-0000-0000-0000-000000000001', title: LONG + ' — Workshop de ' + LONG, description: longBio,
    category: 'learning', address: LONG + ', Rua da Conceição 123, 2710-405 Sintra', starts_at: new Date(Date.now() + 3 * 864e5).toISOString(),
    ends_at: null, source_url: 'https://example.org/' + LONG, source_name: LONG, ai_score: 90, ai_reasoning: '',
    image_url: null, max_participants: null, created_at: null, updated_at: null, country_code: 'PT',
    lat: 38.8, lng: -9.38, distance_km: 3.2,
  }
  await page.route('**/rest/v1/rpc/nearby_quests*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ev]) }))
  await page.goto('/')
  await expect(page.getByText(/Workshop de/).first()).toBeVisible({ timeout: 20_000 })
  await noOverflow(page)
  await page.getByText(/Workshop de/).first().click()
  await page.waitForTimeout(800)
  await noOverflow(page)
  expect(errors).toEqual([])
})
