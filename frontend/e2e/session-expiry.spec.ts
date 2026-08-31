import { expect, test, type Page } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'
import { e2eBaseUrl, requireAdminCredentials } from './helpers/project'

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('.account-menu-trigger')).toHaveCount(1)
}

async function refreshAccessToken(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    if (!response.ok) throw new Error(`Unable to refresh session: ${response.status}`)
    return (await response.json() as { accessToken: string }).accessToken
  })
}

async function statusWithBearer(page: Page, token: string) {
  return page.evaluate(async accessToken => {
    const response = await fetch('/api/v1/auth/me', {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    return response.status
  }, token)
}

async function setStatus(page: Page, email: string, status: 'ACTIVE' | 'LOCKED') {
  await page.goto('/admin/users')
  await expect(page).toHaveURL(/\/admin\/users$/)
  await page.getByPlaceholder('Email or display name').fill(email)
  const control = page.getByLabel(`Account status for ${email}`)
  await expect(control).toBeVisible()
  await control.selectOption(status)
  if (status === 'LOCKED') {
    await page.getByRole('button', { name: 'Lock account', exact: true }).click()
  }
  await expect(page.getByRole('status')).toContainText(status === 'LOCKED' ? 'account is now locked' : 'account is now active')
}

test('account status revokes active sessions and keeps the old bearer invalid after reactivation', async ({ page, browser }) => {
  test.setTimeout(120_000)
  const admin = requireAdminCredentials()
  const runId = Date.now()
  const email = `p7-session-${runId}@example.test`
  const password = 'correct-horse-battery-staple'
  await registerAndVerify(page, email, { password, displayName: 'P7 Session User' })

  const accountContext = await browser.newContext({ baseURL: e2eBaseUrl })
  const accountPage = await accountContext.newPage()
  await signIn(accountPage, email, password)
  const oldBearer = await refreshAccessToken(accountPage)

  const adminContext = await browser.newContext({ baseURL: e2eBaseUrl })
  const adminPage = await adminContext.newPage()
  await signIn(adminPage, admin.email, admin.password)
  await expect(adminPage.getByRole('link', { name: 'Admin', exact: true })).toBeVisible()
  await setStatus(adminPage, email, 'LOCKED')

  const lockedResponse = accountPage.waitForResponse(response => response.url().includes('/api/v1/') && response.status() === 401, { timeout: 15_000 }).catch(() => undefined)
  await accountPage.goto('/projects')
  expect(await lockedResponse).toBeTruthy()
  await expect(accountPage).toHaveURL(/\/login/)

  await setStatus(adminPage, email, 'ACTIVE')
  expect(await statusWithBearer(accountPage, oldBearer)).toBe(401)
  await accountPage.goto('/projects')
  await expect(accountPage).toHaveURL(/\/login/)

  await accountContext.close()
  await adminContext.close()
})
