import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Registration is intentionally rate-limited by the backend. Keep the default
  // suite deterministic; CI can opt into a different value with PW_WORKERS.
  workers: Number(process.env.PW_WORKERS ?? 1),
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    // Keep the browser origin aligned with backend FRONTEND_ORIGIN. Origin-
    // protected refresh/logout calls must not be exercised through an alias
    // that the backend intentionally rejects.
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
