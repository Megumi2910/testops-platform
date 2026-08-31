import { expect, test, type Page } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toBeVisible()
}

test('administrator can manage a user and cannot remove the final active administrator', async ({ page, browser }) => {
  test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, 'E2E bootstrap-admin credentials are not configured')
  test.setTimeout(90_000)
  const runId = Date.now()
  const managedEmail = `phase5-admin-managed-${runId}@example.test`
  const fixtureContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100' })
  try {
    await registerAndVerify(await fixtureContext.newPage(), managedEmail)
  } finally {
    await fixtureContext.close()
  }

  await signIn(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!)
  await page.getByRole('link', { name: 'Admin', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/users$/)
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()

  const search = page.getByPlaceholder('Email or display name')
  await search.fill(managedEmail)
  const managedRole = page.getByLabel(`Platform role for ${managedEmail}`)
  const managedStatus = page.getByLabel(`Account status for ${managedEmail}`)
  await expect(managedRole).toHaveValue('MEMBER')
  await expect(managedStatus).toHaveValue('ACTIVE')

  await managedRole.selectOption('ADMIN')
  await expect(page.getByRole('status')).toContainText('is now a platform administrator.')
  await expect(managedRole).toHaveValue('ADMIN')
  await managedRole.selectOption('MEMBER')
  await page.getByRole('button', { name: 'Demote to member', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('is now a platform member.')
  await managedStatus.selectOption('LOCKED')
  await page.getByRole('button', { name: 'Lock account', exact: true }).click()
  await expect(page.getByRole('status')).toContainText("account is now locked.")
  await expect(managedStatus).toHaveValue('LOCKED')
  await managedStatus.selectOption('ACTIVE')
  await expect(page.getByRole('status')).toContainText("account is now active.")
  await expect(managedStatus).toHaveValue('ACTIVE')

  await search.fill(process.env.E2E_ADMIN_EMAIL!)
  const adminStatus = page.getByLabel(`Account status for ${process.env.E2E_ADMIN_EMAIL!}`)
  await expect(adminStatus).toHaveValue('ACTIVE')
  await adminStatus.selectOption('LOCKED')
  await page.getByRole('button', { name: 'Lock account', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('final active administrator')
  await expect(adminStatus).toHaveValue('ACTIVE')
})
