import { expect, test } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

test.use({ baseURL: process.env.E2E_DISABLED_BASE_URL ?? 'http://localhost:3101' })

test('local origins are visibly disabled when the local bridge is off', async ({ page }) => {
  test.skip(!process.env.E2E_DISABLED_BASE_URL, 'Run against the local-disabled Compose profile')
  await registerAndVerify(page, `local-disabled-${Date.now()}@example.test`)
  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  const option = page.locator('option', { hasText: 'http://localhost:3201' })
  await expect(option).toHaveAttribute('disabled', '')
  await expect(option).toContainText('local_target_disabled')
})
