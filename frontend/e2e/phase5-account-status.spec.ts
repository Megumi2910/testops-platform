import { expect, test, type Page } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

async function setStatus(page: Page, email: string, status: 'ACTIVE' | 'LOCKED' | 'DISABLED') {
  const search = page.getByPlaceholder('Email or display name')
  await search.fill(email)
  const control = page.getByLabel(`Account status for ${email}`)
  await expect(control).toBeVisible()
  await control.selectOption(status)
  if (status === 'LOCKED' || status === 'DISABLED') {
    await page.getByRole('button', { name: `${status === 'LOCKED' ? 'Lock' : 'Disable'} account`, exact: true }).click()
  }
  await expect(page.getByRole('status')).toContainText(`account is now ${status.toLowerCase()}.`)
  await expect(control).toHaveValue(status)
}

async function expectUnavailable(page: Page, email: string, password: string) {
  await signIn(page, email, password)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('alert')).toContainText('This account is unavailable')
}

test('locked and disabled accounts cannot start a password session', async ({ page, browser }) => {
  test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, 'E2E bootstrap-admin credentials are not configured')
  test.setTimeout(90_000)
  const runId = Date.now()
  const managedEmail = `phase5-account-status-${runId}@example.test`
  const managedPassword = 'correct-horse-battery-staple'
  const fixtureContext = await browser.newContext({ baseURL })
  const fixturePage = await fixtureContext.newPage()
  try {
    await registerAndVerify(fixturePage, managedEmail)
  } finally {
    await fixtureContext.close()
  }

  await signIn(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!)
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Admin', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/users$/)

  const accountContext = await browser.newContext({ baseURL })
  const accountPage = await accountContext.newPage()
  try {
    await setStatus(page, managedEmail, 'LOCKED')
    await expectUnavailable(accountPage, managedEmail, managedPassword)

    await setStatus(page, managedEmail, 'DISABLED')
    await expectUnavailable(accountPage, managedEmail, managedPassword)
  } finally {
    await accountContext.close()
    await setStatus(page, managedEmail, 'ACTIVE')
  }
})
