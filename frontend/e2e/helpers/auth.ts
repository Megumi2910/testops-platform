import { expect, type Page } from '@playwright/test'
import { assertBasicAccessibility } from './accessibility'

const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'
async function latestOtp(email: string) {
  const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  expect(search.ok).toBeTruthy()
  const result = await search.json() as { messages: Array<{ ID: string }> }
  const message = await (await fetch(`${mailpit}/api/v1/message/${result.messages[0].ID}`)).json() as { Text?: string; HTML?: string }
  return ((message.Text ?? message.HTML ?? '').match(/\b\d{6}\b/) ?? [])[0]!
}
export async function registerAndVerify(page: Page, email: string) {
  await page.goto('/register')
  await assertBasicAccessibility(page)
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).not.toHaveCount(0)
  await page.getByLabel('Display name').fill('Local Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct-horse-battery-staple')
  await page.getByRole('button', { name: 'Send verification code' }).click()
  await expect(page).toHaveURL(/verify-email/)
  await page.getByLabel('Verification code').fill(await latestOtp(email))
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
}
