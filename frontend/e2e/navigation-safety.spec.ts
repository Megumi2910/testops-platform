import { expect, test, type Page } from '@playwright/test'

import { createProject, createSuite } from './helpers/project'
import { registerAndVerify } from './helpers/auth'

async function createNavigationCase(page: Page, projectId: string, suiteId: string, name: string, role: string, label: string) {
  await page.goto(`/projects/${projectId}/suites/${suiteId}`)
  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Continue to steps', exact: true }).click()
  await page.getByRole('button', { name: 'Add step', exact: true }).click()
  await page.locator('fieldset.step-card').first().getByLabel('Input value').fill('/')
  await page.getByRole('button', { name: 'Add step', exact: true }).click()
  const unsafe = page.locator('fieldset.step-card').nth(1)
  await unsafe.getByLabel('Action').selectOption('CLICK')
  await unsafe.getByRole('combobox', { name: 'Locator', exact: true }).selectOption('ROLE')
  await unsafe.getByLabel('ARIA role').selectOption(role)
  await unsafe.getByLabel('Locator value').fill(label)
  await page.getByRole('button', { name: 'Review case', exact: true }).click()
  await page.getByRole('button', { name: 'Save as READY', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/)
}

test('all browser navigation attempts are blocked before leaving the approved target', async ({ page }) => {
  test.setTimeout(90_000)
  const runId = Date.now()
  await registerAndVerify(page, `p8-navigation-${runId}@example.test`)
  const projectId = await createProject(page, `P8 navigation ${runId}`)
  const suiteId = await createSuite(page, projectId, `P8 navigation suite ${runId}`)
  await createNavigationCase(page, projectId, suiteId, `Click escape ${runId}`, 'LINK', 'Click external link')
  await createNavigationCase(page, projectId, suiteId, `Form escape ${runId}`, 'BUTTON', 'Submit outside form')
  await createNavigationCase(page, projectId, suiteId, `Redirect escape ${runId}`, 'LINK', 'Redirect outside target')
  await createNavigationCase(page, projectId, suiteId, `Script escape ${runId}`, 'BUTTON', 'Script navigation outside target')
  await createNavigationCase(page, projectId, suiteId, `Popup escape ${runId}`, 'LINK', 'Open outside popup')
  await page.goto(`/projects/${projectId}/suites/${suiteId}`)
  await page.getByRole('button', { name: 'Run ready cases', exact: true }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'ERROR', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('BLOCKED_NAVIGATION').first()).toBeVisible()
  const executionId = page.url().match(/\/executions\/([0-9a-f-]+)$/)?.[1]
  expect(executionId).toBeTruthy()
  const detail = await page.evaluate(async ({ projectId: id, executionId: run }) => {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    const session = await refresh.json() as { accessToken: string }
    const response = await fetch(`/api/v1/projects/${id}/executions/${run}`, { credentials: 'include', headers: { Authorization: `Bearer ${session.accessToken}` } })
    return await response.json() as { cases: Array<{ errorCategory?: string; errorMessage?: string }> }
  }, { projectId, executionId: executionId! })
  expect(detail.cases).toHaveLength(5)
  expect(detail.cases.every(item => item.errorCategory === 'BLOCKED_NAVIGATION')).toBeTruthy()
  expect(detail.cases.every(item => item.errorMessage === 'Browser navigation left the approved project target')).toBeTruthy()
})
