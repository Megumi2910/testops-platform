import { expect, test } from '@playwright/test'

const password = 'correct-horse-battery-staple'

test('unverified users can sign in, stay restricted, and recover through the verification banner', async ({ page }) => {
  test.setTimeout(60_000)
  const email = `phase5-unverified-${Date.now()}@example.test`

  await page.goto('/register')
  await page.getByLabel('Display name').fill('Phase 5 unverified')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  await expect(page).toHaveURL(/\/verify-email\?email=/)

  await page.goto(`/login?returnTo=${encodeURIComponent('/projects')}`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/verify-email\?email=.*recover=1&returnTo=%2Fprojects$/)

  await page.goto('/')
  const banner = page.locator('.verification-banner')
  await expect(banner).toContainText('Your email is not verified.')
  await expect(banner.getByRole('link', { name: 'Verify now', exact: true })).toHaveAttribute('href', /\/verify-email\?email=.*recover=1$/)
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0)

  await banner.getByRole('link', { name: 'Verify now', exact: true }).click()
  await expect(page).toHaveURL(/\/verify-email\?email=.*recover=1$/)
  await expect(page.getByRole('heading', { name: 'Verify your email', exact: true })).toBeVisible()
  await expect(page.getByLabel('Verification code')).toBeVisible()
  await expect(page.getByRole('button', { name: /Resend available in/ })).toBeDisabled()
})
