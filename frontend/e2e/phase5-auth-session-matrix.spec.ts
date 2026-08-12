import { expect, test, type Page } from '@playwright/test'

const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'
const password = 'correct-horse-battery-staple'

async function latestOtp(email: string) {
  const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  expect(search.ok).toBeTruthy()
  const result = await search.json() as { messages: Array<{ ID: string }> }
  expect(result.messages.length).toBeGreaterThan(0)
  const message = await (await fetch(`${mailpit}/api/v1/message/${result.messages[0].ID}`)).json() as { Text?: string; HTML?: string }
  const otp = (message.Text ?? message.HTML ?? '').match(/\b\d{6}\b/)?.[0]
  expect(otp).toBeTruthy()
  return otp!
}

async function registerPending(page: Page, email: string) {
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Phase 5 Auth User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Send verification code' }).click()
  await expect(page).toHaveURL(/verify-email/)
}

async function registerAndVerify(page: Page, email: string) {
  await registerPending(page, email)
  await page.getByLabel('Verification code').fill(await latestOtp(email))
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
}

async function navigateWithoutReload(page: Page, path: string) {
  await page.evaluate(nextPath => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`))
}

test('invalid OTP is rejected and a valid code can complete verification', async ({ page }) => {
  const email = `phase5-invalid-otp-${Date.now()}@example.test`
  await registerPending(page, email)
  await page.getByLabel('Verification code').fill('999999')
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await expect(page.getByRole('alert')).toContainText(/invalid|expired/i)
  await page.getByLabel('Verification code').fill(await latestOtp(email))
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
})

test('protected deep links survive unverified login and verification', async ({ page }) => {
  const email = `phase5-return-${Date.now()}@example.test`
  await registerPending(page, email)
  await page.goto('/projects')
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fprojects/)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/verify-email\?.*returnTo=%2Fprojects/)
  await page.getByLabel('Verification code').fill(await latestOtp(email))
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
})

test('active sessions can be individually revoked and then revoked all at once', async ({ page, browser }) => {
  const email = `phase5-sessions-${Date.now()}@example.test`
  await registerAndVerify(page, email)
  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  await secondPage.goto('/login')
  await secondPage.getByLabel('Email').fill(email)
  await secondPage.getByLabel('Password').fill(password)
  await secondPage.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(secondPage).toHaveURL(/\/$/)

  await navigateWithoutReload(page, '/account')
  await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible()
  const revokeButtons = page.getByRole('button', { name: 'Revoke', exact: true })
  await expect(revokeButtons).toHaveCount(2)
  await revokeButtons.last().click()
  await expect(revokeButtons).toHaveCount(1)
  await page.getByRole('button', { name: 'Revoke all sessions', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  await secondContext.close()
})
