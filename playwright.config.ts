import { defineConfig, devices } from '@playwright/test'

// Logged-out browser flows against a local dev server. Signed-in flows are
// covered by unit tests with a mocked Supabase client: auth here is the live
// Supabase project, and tests must not create or touch real accounts.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx next dev -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
