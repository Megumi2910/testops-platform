import { expect, request, type APIResponse, type BrowserContext, type Page } from '@playwright/test'

const mailpitUrl = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'
const applicationOrigin = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
const oauthProviderHost = process.env.OAUTH_PROVIDER_PUBLIC_HOST ?? 'localhost'
const accountPassword = 'correct-horse-battery-staple'

type MailpitSearch = { messages: Array<{ ID: string }> }
type MailpitMessage = { Text?: string; HTML?: string }
type GoogleProfileKind = 'google-only' | 'link' | 'mismatch'

async function searchMessages(email: string) {
  const response = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  expect(response.ok).toBeTruthy()
  return response.json() as Promise<MailpitSearch>
}

export async function mailMessageCount(email: string) {
  return (await searchMessages(email)).messages.length
}

export async function latestMailOtp(email: string, minimumMessages = 1) {
  await expect.poll(() => mailMessageCount(email), { timeout: 10_000 }).toBeGreaterThanOrEqual(minimumMessages)
  const search = await searchMessages(email)
  const messageResponse = await fetch(`${mailpitUrl}/api/v1/message/${search.messages[0].ID}`)
  expect(messageResponse.ok).toBeTruthy()
  const message = await messageResponse.json() as MailpitMessage
  const otp = (message.Text ?? message.HTML ?? '').match(/\b\d{6}\b/)?.[0]
  expect(otp).toMatch(/^\d{6}$/)
  return otp!
}

export async function registerVerifiedAccount(page: Page, email: string, options: {
  displayName?: string
  password?: string
} = {}) {
  const password = options.password ?? accountPassword
  const before = await mailMessageCount(email)
  await page.goto('/register')
  await page.getByLabel('Display name').fill(options.displayName ?? 'Account Security Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Send verification code' }).click()
  await expect(page).toHaveURL(/\/verify-email/)
  await page.getByLabel('Verification code').fill(await latestMailOtp(email, before + 1))
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
  return { password }
}

export async function signInAccount(page: Page, email: string, password = accountPassword) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
}

export async function signOutAccount(page: Page) {
  const trigger = page.getByRole('button', { name: /Open account menu for/ })
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login(?:[?#].*)?$/)
}

export function oauthNonce() {
  return `${Date.now().toString(36)}${process.pid.toString(36)}`.slice(-16).padStart(8, '0')
}

export function googleProfile(kind: GoogleProfileKind, nonce: string) {
  if (!/^[a-z0-9]{8,32}$/.test(nonce)) throw new Error('OAuth profile nonce must be 8-32 lowercase letters or digits')
  return `${kind}.${nonce}` as const
}

export function googleProfileEmail(kind: GoogleProfileKind, nonce: string) {
  googleProfile(kind, nonce)
  return `qa.${kind}.${nonce}@testops.local`
}

export async function setGoogleProfile(context: BrowserContext, profile: ReturnType<typeof googleProfile> | 'legacy') {
  await context.addCookies([{
    name: 'testops_e2e_oauth_profile',
    value: profile,
    domain: oauthProviderHost,
    path: '/o/oauth2/v2/auth',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  }])
}

export async function currentBearer(context: BrowserContext) {
  // Refresh rotation is intentionally destructive for the old cookie. Probe
  // with a copied storage state so the page's in-memory session and browser
  // cookie remain paired while the test records a disposable bearer.
  const cookies = await context.cookies()
  const probe = await request.newContext({
    baseURL: applicationOrigin,
    storageState: { cookies, origins: [] },
  })
  try {
    const refresh = await probe.post('/api/v1/auth/refresh', {
      headers: { Origin: applicationOrigin, Accept: 'application/json' },
    })
    expect(refresh.status()).toBe(200)
    const body = await refresh.json() as { accessToken?: string }
    expect(body.accessToken).toBeTruthy()
    // The probe legitimately rotates the server-side refresh family. Carry
    // the rotated cookie back to the browser context before the page retries;
    // leaving the old cookie in place would make the page appear signed out.
    const rotatedCookies = (await probe.storageState()).cookies.filter(cookie => cookie.name === 'testops_refresh')
    await context.clearCookies({ name: 'testops_refresh' })
    await context.addCookies(rotatedCookies)
    return body.accessToken!
  } finally {
    await probe.dispose()
  }
}

export async function authenticatedPost(context: BrowserContext, path: string, data: object, bearerToken?: string): Promise<APIResponse> {
  const bearer = bearerToken ?? await currentBearer(context)
  return context.request.post(`${applicationOrigin}${path}`, {
    data,
    headers: {
      Origin: applicationOrigin,
      Accept: 'application/json',
      Authorization: `Bearer ${bearer}`,
    },
  })
}

export async function authenticatedPut(context: BrowserContext, path: string, data: object, bearerToken?: string): Promise<APIResponse> {
  const bearer = bearerToken ?? await currentBearer(context)
  return context.request.put(`${applicationOrigin}${path}`, {
    data,
    headers: {
      Origin: applicationOrigin,
      Accept: 'application/json',
      Authorization: `Bearer ${bearer}`,
    },
  })
}

export { accountPassword, applicationOrigin }
