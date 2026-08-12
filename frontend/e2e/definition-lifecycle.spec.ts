import { expect, test } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

test('a draft case can be moved to Trash and restored as DRAFT', async ({ page }) => {
  const runId = Date.now()
  const email = `lifecycle-${runId}@example.test`
  const projectName = `Lifecycle project ${runId}`
  const suiteName = `Lifecycle suite ${runId}`
  const caseName = `Homepage smoke ${runId}`
  const targetOrigin = process.env.E2E_TARGET_ORIGIN ?? 'http://localhost:3201'

  await registerAndVerify(page, email)

  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await page.getByLabel('Name').fill(projectName)
  await page.getByLabel('Target origin').selectOption({ label: targetOrigin })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)

  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.getByRole('textbox', { name: 'Suite name' }).fill(suiteName)
  await page.getByRole('button', { name: 'Add suite' }).click()
  await page.getByRole('link', { name: new RegExp(suiteName) }).click()

  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await page.getByLabel('Name').fill(caseName)
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/)
  await expect(page.locator('.status-badge').filter({ hasText: 'DRAFT' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run case' })).toBeDisabled()

  await page.getByRole('button', { name: 'Move to trash' }).click()
  const archiveResponse = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url().includes('/cases/'))
  await expect(page.getByRole('dialog', { name: new RegExp(`Move ${caseName} to Trash`) })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click()
  await expect((await archiveResponse).status()).toBe(200)
  await expect(page).toHaveURL(/\/trash$/)

  await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible()
  const archivedCase = page.getByRole('link', { name: caseName, exact: true })
  await expect(archivedCase).toBeVisible()
  await expect(page.getByText('ARCHIVED', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Restore' }).click()
  const restoreDialog = page.getByRole('dialog', { name: 'Restore case?' })
  await expect(restoreDialog).toBeVisible()
  await expect(restoreDialog.getByLabel('Restore name')).toHaveValue(caseName)
  const restoreResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/restore'))
  await restoreDialog.getByRole('button', { name: 'Restore case' }).click()
  await expect((await restoreResponse).status()).toBe(200)
  await expect(page.getByRole('status')).toContainText('Case restored successfully')
  await expect(page.getByRole('heading', { name: 'Trash is empty' })).toBeVisible()

  await page.getByRole('link', { name: 'View active suites' }).click()
  await page.getByRole('link', { name: new RegExp(suiteName) }).click()
  await expect(page.getByRole('link', { name: caseName, exact: true })).toBeVisible()
  await expect(page.locator('.status-badge').filter({ hasText: 'DRAFT' }).first()).toBeVisible()
})
