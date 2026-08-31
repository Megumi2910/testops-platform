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
  // DRAFT definitions do not render an execution action; only READY cases
  // expose the Run case control.
  await expect(page.getByRole('button', { name: 'Run case' })).toHaveCount(0)

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

  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.getByRole('link', { name: new RegExp(suiteName) }).click()
  await expect(page.getByRole('link', { name: caseName, exact: true })).toBeVisible()
  await expect(page.locator('.status-badge').filter({ hasText: 'DRAFT' }).first()).toBeVisible()
})

test('an archived suite is read-only until it is restored', async ({ page }) => {
  const runId = Date.now()
  const targetOrigin = process.env.E2E_TARGET_ORIGIN ?? 'http://localhost:3201'
  const email = `suite-lifecycle-${runId}@example.test`
  const projectName = `Suite lifecycle project ${runId}`
  const suiteName = `Archiveable suite ${runId}`

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

  await page.getByRole('button', { name: 'Move to trash' }).click()
  const archiveResponse = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url().includes('/suites/'))
  const archiveDialog = page.getByRole('dialog', { name: new RegExp(`Move ${suiteName} to Trash`) })
  await expect(archiveDialog).toBeVisible()
  await archiveDialog.getByRole('button', { name: 'Move to trash' }).click()
  await expect((await archiveResponse).status()).toBe(200)
  await expect(page).toHaveURL(/\/trash$/)

  await page.getByRole('link', { name: new RegExp(suiteName) }).click()
  await expect(page.getByText('This suite is in Trash.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run ready cases' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'New case', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit suite' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Restore suite' })).toBeVisible()

  await page.getByRole('button', { name: 'Restore suite' }).click()
  const restoreDialog = page.getByRole('dialog', { name: 'Restore suite?' })
  await expect(restoreDialog).toBeVisible()
  const restoreResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/restore'))
  await restoreDialog.getByRole('button', { name: 'Restore suite' }).click()
  await expect((await restoreResponse).status()).toBe(200)
  await expect(page.getByRole('link', { name: 'New case', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit suite' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Move to trash' })).toBeVisible()
})

test('restoring a suite with an active name reports a conflict and accepts a rename', async ({ page }) => {
  const runId = Date.now()
  const targetOrigin = process.env.E2E_TARGET_ORIGIN ?? 'http://localhost:3201'
  const email = `suite-conflict-${runId}@example.test`
  const projectName = `Suite conflict project ${runId}`
  const suiteName = `Reusable suite ${runId}`
  const restoredName = `${suiteName} restored`

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
  await page.getByRole('button', { name: 'Move to trash' }).click()
  const archiveResponse = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url().includes('/suites/'))
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click()
  await expect((await archiveResponse).status()).toBe(200)

  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.getByRole('textbox', { name: 'Suite name' }).fill(suiteName)
  await page.getByRole('button', { name: 'Add suite' }).click()
  await expect(page.getByRole('link', { name: new RegExp(suiteName) })).toBeVisible()

  await page.getByRole('link', { name: 'Trash', exact: true }).click()
  await page.getByRole('link', { name: new RegExp(suiteName) }).click()
  await page.getByRole('button', { name: 'Restore suite' }).click()
  const restoreDialog = page.getByRole('dialog', { name: 'Restore suite?' })
  const conflictResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/restore'))
  await restoreDialog.getByRole('button', { name: 'Restore suite' }).click()
  await expect((await conflictResponse).status()).toBe(409)
  await expect(restoreDialog.getByText('That name is already active.')).toBeVisible()

  await restoreDialog.getByLabel('Restore name').fill(restoredName)
  const renameResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/restore'))
  await restoreDialog.getByRole('button', { name: 'Restore suite' }).click()
  await expect((await renameResponse).status()).toBe(200)
  await expect(page.getByRole('heading', { name: restoredName })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New case', exact: true })).toBeVisible()
})

test('an archived project blocks definition controls until the project is restored', async ({ page }) => {
  const runId = Date.now()
  const targetOrigin = process.env.E2E_TARGET_ORIGIN ?? 'http://localhost:3201'
  const email = `project-lifecycle-${runId}@example.test`
  const projectName = `Project lifecycle ${runId}`
  const suiteName = `Archived project suite ${runId}`

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
  await page.getByRole('link', { name: 'Overview', exact: true }).click()

  await page.getByRole('button', { name: 'Archive' }).click()
  const archiveDialog = page.getByRole('dialog', { name: new RegExp(`Archive ${projectName}`) })
  await expect(archiveDialog).toBeVisible()
  const archiveResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/archive'))
  await archiveDialog.getByRole('button', { name: 'Archive project' }).click()
  await expect((await archiveResponse).status()).toBe(200)
  await expect(page.getByText('ARCHIVED', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore project' })).toBeVisible()

  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.getByRole('link', { name: new RegExp(suiteName) }).click()
  await expect(page.getByRole('link', { name: 'New case', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit suite' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Move to trash' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Run ready cases' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Restore project' }).click()
  const restoreDialog = page.getByRole('dialog', { name: new RegExp(`Restore ${projectName}`) })
  await expect(restoreDialog).toBeVisible()
  const restoreResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/restore'))
  await restoreDialog.getByRole('button', { name: 'Restore project' }).click()
  await expect((await restoreResponse).status()).toBe(200)
  await expect(page.getByRole('link', { name: 'New case', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit suite' })).toBeVisible()
})
