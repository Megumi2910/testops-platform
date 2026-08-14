import { expect, test, type Page } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

async function createProjectAndSuite(page: Page, targetOrigin: string, prefix: string) {
  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  const projectName = `${prefix} project ${Date.now()}`
  await page.getByLabel('Name').fill(projectName)
  await page.getByLabel('Target origin').selectOption({ label: targetOrigin })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)
  const projectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1]
  expect(projectId).toBeTruthy()
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  const suiteName = `${prefix} suite ${Date.now()}`
  await page.getByRole('textbox', { name: 'Suite name' }).fill(suiteName)
  await page.getByRole('button', { name: 'Add suite' }).click()
  await page.getByRole('link', { name: new RegExp(suiteName) }).click()
  const suiteId = page.url().match(/\/suites\/([0-9a-f-]+)$/)?.[1]
  expect(suiteId).toBeTruthy()
  return { projectId: projectId!, suiteId: suiteId! }
}

async function createReadyCase(page: Page, projectId: string, suiteId: string, name: string, waitMs?: number) {
  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/suites/${suiteId}/cases/new$`))
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.locator('fieldset.step-card').nth(0).getByLabel('Input value').fill('/')
  if (waitMs !== undefined) {
    await page.getByRole('button', { name: 'Add step' }).click()
    const waitStep = page.locator('fieldset.step-card').nth(1)
    await waitStep.getByLabel('Action').selectOption('ASSERT_VISIBLE')
    await waitStep.locator('select').nth(1).selectOption('TEXT')
    await waitStep.getByLabel('Locator value').fill('Never appears in fixture')
    await waitStep.getByLabel('Timeout (ms)').fill(String(waitMs))
  }
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY' }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/)
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.locator(`a[href$="/suites/${suiteId}"]`).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/suites/${suiteId}$`))
}

test('a queued suite can be cancelled and reports cancelled case results', async ({ page }) => {
  test.setTimeout(60_000)
  const email = `phase5-cancel-${Date.now()}@example.test`
  await registerAndVerify(page, email)
  const { projectId, suiteId } = await createProjectAndSuite(page, 'http://localhost:3201', 'Cancellation')
  await createReadyCase(page, projectId, suiteId, `Slow case ${Date.now()}`, 5000)
  await createReadyCase(page, projectId, suiteId, `Second case ${Date.now()}`)

  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/suites/${suiteId}$`))
  await page.getByRole('button', { name: 'Run ready cases' }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]+$/)
  const cancel = page.getByRole('button', { name: 'Cancel run', exact: true })
  await expect(cancel).toBeVisible({ timeout: 8_000 })
  await cancel.click()
  await expect(page.getByRole('heading', { name: 'CANCELLED', exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/cancelled/i).first()).toBeVisible()
  await expect(page.getByText('Cancellation requested').first()).toBeVisible()
})

test('an infrastructure failure honors case retry count and preserves its category', async ({ page }) => {
  test.setTimeout(60_000)
  const email = `phase5-retry-${Date.now()}@example.test`
  await registerAndVerify(page, email)
  const { projectId, suiteId } = await createProjectAndSuite(page, 'http://localhost:3299', 'Retry')
  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/suites/${suiteId}/cases/new$`))
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill(`Retry target ${Date.now()}`)
  await page.getByLabel('Retry count').fill('1')
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.locator('fieldset.step-card').nth(0).getByLabel('Input value').fill('/')
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY' }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/)
  await page.getByRole('button', { name: 'Run case', exact: true }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'ERROR', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/2 attempt\(s\)/)).toBeVisible()
  await expect(page.getByText(/TARGET_UNREACHABLE/)).toBeVisible()
  await expect(page.getByText(/net::ERR_CONNECTION_REFUSED/).first()).toBeVisible()
  await expect(page.getByText(/Call log:|stack=/)).toHaveCount(0)
})
