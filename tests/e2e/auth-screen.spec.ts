import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (location.hostname !== 'localhost') return
    localStorage.setItem('emerge_onboarding_seen', '1')
    localStorage.setItem('emerge_install_tip_seen', '1')
    localStorage.setItem('emerge-location', JSON.stringify({ lat: 38.7223, lng: -9.1393, name: 'Lisbon', countryCode: 'PT', source: 'manual' }))
  })
})

test('signing up shows "check your email" instead of silently closing', async ({ page }) => {
  // Mocked: Supabase's answer when the account still needs email confirmation
  // (a user, no session). Nothing reaches the real auth server.
  let signupCalls = 0
  await page.route(/supabase\.co\/auth\/v1\/signup/, route => {
    signupCalls++
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
        email: 'sweep-test@example.test', identities: [{ id: 'x', provider: 'email' }],
        created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {},
      }),
    })
  })
  await page.goto('/?auth=signup')
  await page.getByPlaceholder('First name').fill('Sweep')
  await page.getByPlaceholder('Email').fill('sweep-test@example.test')
  await page.getByPlaceholder('Password').fill('not-a-real-pass-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Check your email to confirm your account.')).toBeVisible()
  expect(signupCalls).toBe(1)
})

test('an expired email link explains itself', async ({ page }) => {
  await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await expect(page.getByText(/That email link has expired or was already used/)).toBeVisible({ timeout: 15_000 })
  expect(page.url()).not.toContain('error=')
})

test('phone Back closes the sign-in screen and stays in the app', async ({ page }) => {
  await page.goto('/privacy')
  await page.goto('/?auth=signin')
  await expect(page.getByPlaceholder('Password')).toBeVisible()
  await page.goBack()
  await page.waitForTimeout(800)
  expect(new URL(page.url()).pathname).toBe('/')
  await expect(page.getByPlaceholder('Password')).toHaveCount(0)
  await expect(page.getByText('Events near you', { exact: true }).first()).toBeVisible()
})
