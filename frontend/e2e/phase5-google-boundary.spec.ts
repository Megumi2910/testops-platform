import { expect, test } from '@playwright/test'

test('the deterministic Google provider completes sign-in and refreshes the session', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('link', { name: 'Continue with Google', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Continue with Google', exact: true }).click()

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'QA Google User', exact: true })).toBeVisible()
})

test('the OAuth callback renders a safe provider failure without exposing details', async ({ page }) => {
  await page.goto('/auth/oauth/callback?oauth_error=oauth_sign_in_failed')

  await expect(page.getByRole('heading', { name: 'Google sign-in needs attention', exact: true })).toBeVisible()
  await expect(page.getByText('Google sign-in could not be completed. Try again or sign in with your password.', { exact: true })).toBeVisible()
  await expect(page.getByText(/client_secret|token|stack|exception/i)).toHaveCount(0)
})
