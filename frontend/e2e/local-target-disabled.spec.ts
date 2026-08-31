import { expect, test } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

test.use({ baseURL: process.env.E2E_DISABLED_BASE_URL ?? 'http://localhost:3101' })

test('the local bridge blocks project creation before target selection', async ({ page }) => {
  test.skip(!process.env.E2E_DISABLED_BASE_URL, 'Run against the local-disabled Compose profile')
  await registerAndVerify(page, `local-disabled-${Date.now()}@example.test`)
  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Project setup required', exact: true })).toBeVisible()
  await expect(page.getByText('A platform administrator must register at least one safe HTTP(S) target origin before projects can be created.')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Target origin' })).toHaveCount(0)
})
