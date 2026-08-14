import { expect, test } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

async function createProject(page: import('@playwright/test').Page, targetOrigin: string, name: string) {
  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Target origin').selectOption({ label: targetOrigin })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)
}

async function createSuite(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.getByRole('textbox', { name: 'Suite name' }).fill(`Negative suite ${Date.now()}`)
  await page.getByRole('button', { name: 'Add suite' }).click()
  await page.getByRole('link', { name: /Negative suite/ }).click()
}

test('an allowlisted but offline localhost port is reported as unreachable', async ({ page }) => {
  await registerAndVerify(page, `unreachable-${Date.now()}@example.test`)
  await createProject(page, 'http://localhost:3299', `Offline target ${Date.now()}`)
  await page.getByRole('button', { name: 'Check connection' }).click()
  await expect(page.getByText('UNREACHABLE', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Start the website, confirm the port and Docker host alias, then run Check connection again.')).toBeVisible()
  await expect(page.getByText('TARGET_UNREACHABLE', { exact: true })).toBeVisible()
})

test('a suite without READY cases explains why it cannot run', async ({ page }) => {
  await registerAndVerify(page, `no-ready-${Date.now()}@example.test`)
  await createProject(page, 'http://localhost:3201', `No ready cases ${Date.now()}`)
  await createSuite(page)
  await page.getByRole('button', { name: 'Run ready cases' }).click()
  await expect(page.getByText('Unable to queue this suite run.')).toBeVisible()
})

test('a failing assertion identifies the failed step', async ({ page }) => {
  await registerAndVerify(page, `failed-assertion-${Date.now()}@example.test`)
  await createProject(page, 'http://localhost:3201', `Failing assertion ${Date.now()}`)
  await createSuite(page)
  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill('Failing assertion')
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.getByLabel('Input value').fill('/')
  await page.getByRole('button', { name: 'Add step' }).click()
  const failingStep = page.locator('fieldset.step-card').nth(1)
  await failingStep.getByLabel('Action').selectOption('ASSERT_VISIBLE')
  await failingStep.getByRole('combobox', { name: 'Locator' }).selectOption('TEXT')
  await failingStep.getByLabel('Locator value').fill('Text that is not on the page')
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY' }).click()
  await page.getByRole('button', { name: 'Run case' }).click()
  await expect(page.getByRole('heading', { name: 'FAILED' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('ASSERT_VISIBLE')).toBeVisible()
})

test('cross-origin navigation is rejected at the execution step', async ({ page }) => {
  await registerAndVerify(page, `cross-origin-${Date.now()}@example.test`)
  await createProject(page, 'http://localhost:3201', `Cross origin ${Date.now()}`)
  await createSuite(page)
  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill('Cross-origin navigation')
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.getByLabel('Input value').fill('/')
  await page.getByRole('button', { name: 'Add step' }).click()
  const unsafeStep = page.locator('fieldset.step-card').nth(1)
  await unsafeStep.getByLabel('Input value').fill('https://example.com')
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY' }).click()
  await page.getByRole('button', { name: 'Run case' }).click()
  await expect(page.getByRole('heading', { name: /FAILED|ERROR/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/unsafe target|outside the project target/i).first()).toBeVisible()
})
