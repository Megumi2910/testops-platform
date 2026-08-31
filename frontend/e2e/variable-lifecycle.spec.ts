import { expect, test, type Page } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'
import { createProject, createSuite, openVariables } from './helpers/project'

async function createReferencedCase(page: Page, projectId: string, suiteId: string, variableKey: string) {
  await page.goto(`/projects/${projectId}/suites/${suiteId}/cases/new`)
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill(`P7 variable reference ${Date.now()}`)
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Add step', exact: true }).click()
  await page.getByRole('button', { name: 'Add step', exact: true }).click()
  const steps = page.locator('fieldset.step-card')
  await steps.nth(0).getByLabel('Input value').fill('/')
  await steps.nth(1).getByLabel('Action').selectOption('FILL')
  await steps.nth(1).getByRole('combobox', { name: /^Locator/ }).selectOption('ROLE')
  await steps.nth(1).getByLabel('ARIA role').selectOption('TEXTBOX')
  await steps.nth(1).getByLabel('Locator value').fill('search')
  await steps.nth(1).getByLabel('Input value').fill(`\${${variableKey}}`)
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY' }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/)
}

test('plain and secret variables cover masking, duplicate, stale, and reference-safe deletion', async ({ page }) => {
  test.setTimeout(120_000)
  const runId = Date.now()
  await registerAndVerify(page, `p7-variable-${runId}@example.test`, { displayName: 'P7 Variable Owner' })
  const projectId = await createProject(page, `P7 variables ${runId}`)
  await openVariables(page, projectId)

  const plainKey = `P7_PLAIN_${runId}`
  await page.getByLabel('Variable key').fill(plainKey)
  await page.getByLabel('Variable value').fill('plain-value')
  await page.getByRole('button', { name: 'Save variable' }).click()
  await expect(page.getByText(plainKey.toUpperCase(), { exact: true })).toBeVisible()
  await expect(page.getByText('plain-value', { exact: true })).toBeVisible()

  await page.getByLabel('Variable key').fill(plainKey)
  await page.getByLabel('Variable value').fill('duplicate')
  const duplicate = page.waitForResponse(response => response.url().endsWith('/variables') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Save variable' }).click()
  expect((await duplicate).status()).toBe(409)
  await expect(page.getByText('A variable with this key already exists.', { exact: true })).toBeVisible()

  const row = page.getByRole('listitem').filter({ hasText: plainKey.toUpperCase() })
  await row.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel(`New value for ${plainKey.toUpperCase()}`).fill('updated-value')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('updated-value', { exact: true })).toBeVisible()

  await row.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.route(`**/api/v1/projects/${projectId}/variables/${encodeURIComponent(plainKey.toUpperCase())}`, async route => {
    const body = JSON.parse(route.request().postData() ?? '{}')
    await route.continue({ postData: JSON.stringify({ ...body, projectVersion: 0 }) })
  })
  await page.getByLabel(`New value for ${plainKey.toUpperCase()}`).fill('stale-value')
  const stale = page.waitForResponse(response => response.url().includes('/variables/') && response.request().method() === 'PUT')
  await page.getByRole('button', { name: 'Save changes' }).click()
  expect((await stale).status()).toBe(409)
  await expect(page.getByText(/changed in another session|latest data was reloaded/i)).toBeVisible()
  await page.unroute(`**/api/v1/projects/${projectId}/variables/${encodeURIComponent(plainKey.toUpperCase())}`)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  const secretKey = `P7_SECRET_${runId}`
  await page.getByLabel('Variable key').fill(secretKey)
  await page.getByLabel('Variable value').fill('super-secret-value')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Save variable' }).click()
  await expect(page.getByText(secretKey.toUpperCase(), { exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('super-secret-value')
  await expect(page.getByText('••••••••', { exact: true })).toBeVisible()

  const suiteId = await createSuite(page, projectId, `P7 variable suite ${runId}`)
  await createReferencedCase(page, projectId, suiteId, plainKey.toUpperCase())
  await openVariables(page, projectId)
  const secretRow = page.getByRole('listitem').filter({ hasText: secretKey.toUpperCase() })
  await secretRow.getByRole('button', { name: 'Remove', exact: true }).click()
  await page.getByRole('button', { name: 'Remove variable', exact: true }).click()
  await expect(page.getByText(secretKey.toUpperCase(), { exact: true })).toHaveCount(0)
  const referencedRow = page.getByRole('listitem').filter({ hasText: plainKey.toUpperCase() })
  await referencedRow.getByRole('button', { name: 'Remove', exact: true }).click()
  const referenceResponse = page.waitForResponse(response => response.url().includes('/variables/') && response.request().method() === 'DELETE')
  await page.getByRole('button', { name: 'Remove variable', exact: true }).click()
  expect((await referenceResponse).status()).toBe(409)
  await expect(page.getByText('Variable is still in use.', { exact: true })).toBeVisible()
})
