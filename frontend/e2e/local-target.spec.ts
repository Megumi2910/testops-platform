import { expect, test } from '@playwright/test'
import { registerAndVerify } from './helpers/auth'
import { assertBasicAccessibility, assertNoHorizontalOverflowAt320px } from './helpers/accessibility'

test('local target goes from connectivity check to a passing screenshot run', async ({ page }) => {
  const email = `local-${Date.now()}@example.test`
  const projectName = `Local storefront smoke ${Date.now()}`
  await registerAndVerify(page, email)
  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await assertBasicAccessibility(page)
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill(projectName)
  await page.getByRole('combobox', { name: 'Target origin' }).selectOption({ label: 'http://localhost:3201' })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)
  await page.getByRole('button', { name: 'Check connection' }).click()
  await expect(page.getByText('REACHABLE')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.getByRole('textbox', { name: 'Suite name' }).fill('Homepage')
  await page.getByRole('button', { name: 'Add suite' }).click()
  await page.getByRole('link', { name: /Homepage/ }).click()
  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await assertBasicAccessibility(page)
  await assertNoHorizontalOverflowAt320px(page)
  const assertionStep = page.locator('.step-card').nth(1)
  await assertionStep.getByRole('combobox', { name: 'Locator' }).selectOption('TEXT_EXACT')
  await assertionStep.getByRole('textbox', { name: 'Locator value' }).fill('Danh mục sản phẩm')
  await assertionStep.getByRole('spinbutton', { name: 'Matching element index (optional)' }).fill('0')
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY' }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/)
  await page.getByRole('button', { name: 'Run case' }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'PASSED' })).toBeVisible({ timeout: 30_000 })
  await assertBasicAccessibility(page)
  await expect(page.getByText('TAKE_SCREENSHOT')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview screenshot' })).toBeVisible()
})
