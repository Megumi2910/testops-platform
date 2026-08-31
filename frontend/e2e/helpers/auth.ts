import { expect, type Page } from '@playwright/test'
import { assertBasicAccessibility } from './accessibility'

const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'
export const defaultE2ePassword = 'correct-horse-battery-staple'

type RegistrationOptions = {
  displayName?: string
  password?: string
}

async function messageIds(email: string) {
  const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  expect(search.ok).toBeTruthy()
  const result = await search.json() as { messages: Array<{ ID: string }> }
  return result.messages.map(message => message.ID)
}

export async function messageCount(email: string) {
  return (await messageIds(email)).length
}

export async function latestOtp(email: string, minimumMessageCount = 1) {
  await expect.poll(() => messageCount(email), {
    message: `Mailpit did not receive the expected message for ${email}`,
    timeout: 10_000,
    intervals: [100, 250, 500, 1_000],
  }).toBeGreaterThanOrEqual(minimumMessageCount)
  const [latestMessageId] = await messageIds(email)
  if (!latestMessageId) throw new Error(`Mailpit returned no message for ${email}.`)
  const messageResponse = await fetch(`${mailpit}/api/v1/message/${latestMessageId}`)
  expect(messageResponse.ok).toBeTruthy()
  const message = await messageResponse.json() as { Text?: string; HTML?: string }
  const otp = (message.Text ?? message.HTML ?? '').match(/\b\d{6}\b/)?.[0]
  if (!otp) throw new Error(`Mailpit message for ${email} did not contain an OTP.`)
  return otp
}

export async function registerPending(page: Page, email: string, options: RegistrationOptions = {}) {
  const displayName = options.displayName ?? 'Local Tester'
  const password = options.password ?? defaultE2ePassword
  const previousMessageCount = await messageCount(email)
  await page.goto('/register')
  await assertBasicAccessibility(page)
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).not.toHaveCount(0)
  await page.getByLabel('Display name').fill(displayName)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Send verification code' }).click()
  await expect(page).toHaveURL(/verify-email/)
  return { displayName, password, previousMessageCount }
}

export async function registerAndVerify(page: Page, email: string, options: RegistrationOptions = {}) {
  const registration = await registerPending(page, email, options)
  await page.getByLabel('Verification code').fill(await latestOtp(email, registration.previousMessageCount + 1))
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
  return registration
}

export async function signIn(page: Page, email: string, password = defaultE2ePassword) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('.account-menu-trigger')).toHaveCount(1)
}
