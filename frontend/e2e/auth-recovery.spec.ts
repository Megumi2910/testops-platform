import { test, expect, type Page } from '@playwright/test'

const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'

async function latestOtp(email: string) {
  const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  expect(search.ok).toBeTruthy()
  const result = await search.json() as { messages: Array<{ ID: string }> }
  expect(result.messages.length).toBeGreaterThan(0)
  const message = await (await fetch(`${mailpit}/api/v1/message/${result.messages[0].ID}`)).json() as { Text?: string; HTML?: string }
  const text = message.Text ?? message.HTML ?? ''
  const otp = text.match(/\b\d{6}\b/)?.[0]
  expect(otp).toBeTruthy()
  return otp!
}

async function register(page: Page, email: string) {
  await page.goto('/register')
  await page.getByLabel('Display name').fill('E2E User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct-horse-battery-staple')
  await page.getByRole('button', { name: 'Send verification code' }).click()
  await expect(page).toHaveURL(/verify-email/)
}

test('registration can be completed with the emailed OTP', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`
  await register(page, email)
  await page.getByLabel('Verification code').fill(await latestOtp(email))
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
})

test('unverified login recovers after leaving verification and following the banner', async ({ page }) => {
  const email = `recovery-${Date.now()}@example.test`
  await register(page, email)
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct-horse-battery-staple')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('status')).toContainText('not verified')
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Verify now' }).click()
  await expect(page).toHaveURL(/verify-email.*recover=1/)
  await expect(page.locator('.auth-card [role="status"]')).toContainText('fresh verification code')
  await page.getByLabel('Verification code').fill(await latestOtp(email))
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
})

test('reloading recovery page does not create a second automatic resend', async ({ page }) => {
  const email = `reload-${Date.now()}@example.test`
  await register(page, email)
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct-horse-battery-staple')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('link', { name: 'Verify now' }).click()
  await expect(page.locator('.auth-card [role="status"]')).toContainText('fresh verification code')
  await page.reload()
  await expect(page.getByLabel('Verification code')).toBeVisible()
})
