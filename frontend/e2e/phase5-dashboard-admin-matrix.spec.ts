import { expect, test } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

test('a verified member sees populated dashboard reporting after a completed run', async ({ page }) => {
  const email = `phase5-dashboard-${Date.now()}@example.test`
  await registerAndVerify(page, email)

  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await page.getByLabel('Name').fill(`Dashboard project ${Date.now()}`)
  await page.getByLabel('Target origin').selectOption({ label: 'http://localhost:3201' })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)

  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  const suiteName = `Dashboard suite ${Date.now()}`
  await page.getByRole('textbox', { name: 'Suite name' }).fill(suiteName)
  await page.getByRole('button', { name: 'Add suite' }).click()
  await page.getByRole('link', { name: new RegExp(suiteName) }).click()
  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill(`Dashboard smoke ${Date.now()}`)
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.getByLabel('Input value').fill('/')
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY' }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/)
  await page.getByRole('button', { name: 'Run case', exact: true }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'PASSED', exact: true })).toBeVisible({ timeout: 30_000 })

  const dashboardResponses: number[] = []
  page.on('response', response => {
    if (response.url().includes('/api/v1/dashboard/')) dashboardResponses.push(response.status())
  })
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Execution dashboard', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent failures', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Infrastructure categories', exact: true })).toBeVisible()
  await expect.poll(() => dashboardResponses.length).toBeGreaterThanOrEqual(3)
  expect(dashboardResponses.every(status => status === 200)).toBeTruthy()
  await expect(page.getByText('Executions', { exact: true })).toBeVisible()
})

test('a guest cannot open the administrator route', async ({ page }) => {
  await page.goto('/admin/users')
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fadmin%2Fusers$/)
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
})

test('a verified member is redirected away from the administrator route', async ({ page }) => {
  await registerAndVerify(page, `phase5-admin-guard-${Date.now()}@example.test`)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/admin/users')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Execution dashboard', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toHaveCount(0)
})
