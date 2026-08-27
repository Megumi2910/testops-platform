import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type APIResponse, type Response } from '@playwright/test'

import {
  accountPassword,
  applicationOrigin,
  authenticatedPost,
  authenticatedPut,
  currentBearer,
  googleProfile,
  googleProfileEmail,
  latestMailOtp,
  mailMessageCount,
  oauthNonce,
  registerVerifiedAccount,
  setGoogleProfile,
  signInAccount,
  signOutAccount,
} from './helpers/accountSecurity'

type CaseId =
  | 'password-change-wrong-current'
  | 'password-change-success-relogin'
  | 'password-setup-google-only'
  | 'password-setup-cooldown'
  | 'password-setup-invalid-code'
  | 'password-setup-success'
  | 'provider-link-success'
  | 'provider-unlink-blank-password'
  | 'provider-unlink-wrong-password'
  | 'provider-unlink-last-method'
  | 'provider-unlink-success-revocation'

type NegativeContract = {
  case_id: CaseId
  method: 'POST' | 'PUT'
  path: string
  status: number
  problem_code: string
}

const viewport = '1440x900'
const outputPath = fileURLToPath(new URL('../../artifacts/browser-evidence/inputs/account-security-result.json', import.meta.url))
const caseIds: CaseId[] = [
  'password-change-wrong-current',
  'password-change-success-relogin',
  'password-setup-google-only',
  'password-setup-cooldown',
  'password-setup-invalid-code',
  'password-setup-success',
  'provider-link-success',
  'provider-unlink-blank-password',
  'provider-unlink-wrong-password',
  'provider-unlink-last-method',
  'provider-unlink-success-revocation',
]
const expectedNegatives: NegativeContract[] = [
  { case_id: 'password-change-wrong-current', method: 'PUT', path: '/api/v1/auth/me/password', status: 401, problem_code: 'password_invalid' },
  { case_id: 'password-change-success-relogin', method: 'POST', path: '/api/v1/auth/login', status: 401, problem_code: 'login_invalid' },
  { case_id: 'password-change-success-relogin', method: 'POST', path: '/api/v1/auth/refresh', status: 401, problem_code: 'refresh_invalid' },
  { case_id: 'password-setup-invalid-code', method: 'POST', path: '/api/v1/auth/me/password/confirm', status: 400, problem_code: 'verification_invalid' },
  { case_id: 'provider-unlink-blank-password', method: 'POST', path: '/api/v1/auth/me/login-methods/google/unlink', status: 400, problem_code: 'validation_failed' },
  { case_id: 'provider-unlink-wrong-password', method: 'POST', path: '/api/v1/auth/me/login-methods/google/unlink', status: 401, problem_code: 'password_invalid' },
  { case_id: 'provider-unlink-last-method', method: 'POST', path: '/api/v1/auth/me/login-methods/google/unlink', status: 409, problem_code: 'password_required' },
  { case_id: 'provider-unlink-success-revocation', method: 'POST', path: '/api/v1/auth/refresh', status: 401, problem_code: 'refresh_invalid' },
]

test('account security covers password, setup, link, unlink, and revocation boundaries', async ({ browser, page }) => {
  test.setTimeout(180_000)
  await rm(outputPath, { force: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  const assertionTotals = new Map<CaseId, number>(caseIds.map(id => [id, 0]))
  const observedNegatives: Array<NegativeContract & { count: number }> = []
  const check = <T>(caseId: CaseId, actual: T) => {
    assertionTotals.set(caseId, (assertionTotals.get(caseId) ?? 0) + 1)
    return expect(actual)
  }
  const observeNegative = async (caseId: CaseId, response: Response | APIResponse, methodOverride?: NegativeContract['method']) => {
    const body = await response.json() as { code?: string }
    const observed = {
      case_id: caseId,
      method: methodOverride ?? ('request' in response ? response.request().method() : 'POST'),
      path: new URL(response.url()).pathname,
      status: response.status(),
      problem_code: body.code ?? 'missing_problem_code',
    } as NegativeContract
    const expected = expectedNegatives.find(contract =>
      contract.case_id === observed.case_id && contract.method === observed.method && contract.path === observed.path)
    if (!expected) throw new Error(`Unexpected negative tuple ${observed.method} ${observed.path} status=${observed.status} code=${observed.problem_code}`)
    check(caseId, observed).toEqual(expected)
    observedNegatives.push({ ...observed, count: 1 })
  }

  const suffix = oauthNonce()
  const passwordEmail = `qa.password.${suffix}@testops.local`
  const changedPassword = 'new-correct-horse-battery-staple'

  await registerVerifiedAccount(page, passwordEmail, { displayName: 'Password Boundary User' })
  const passwordSecondContext = await browser.newContext({ baseURL: applicationOrigin, viewport: { width: 1440, height: 900 } })
  const passwordSecondPage = await passwordSecondContext.newPage()
  const passwordSecondBearer = await signInAccount(passwordSecondPage, passwordEmail)

  await page.goto('/account#security')
  await page.getByLabel('Current password').fill('wrong-current-password')
  await page.getByRole('textbox', { name: 'New password', exact: true }).fill(changedPassword)
  await page.getByLabel('Confirm new password').fill(changedPassword)
  const wrongChange = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/me/password') && response.request().method() === 'PUT')
  await page.getByRole('button', { name: 'Change password' }).click()
  check('password-change-wrong-current', (await wrongChange).status()).toBe(401)
  await check('password-change-wrong-current', page.getByText('Current password is incorrect')).toBeVisible()
  await check('password-change-wrong-current', page.getByLabel('Current password')).toHaveAttribute('aria-invalid', 'true')
  const wrongChangeBearer = passwordSecondBearer
  await observeNegative('password-change-wrong-current', await authenticatedPut(passwordSecondContext, '/api/v1/auth/me/password', {
    currentPassword: 'wrong-current-password', newPassword: changedPassword, confirmation: changedPassword,
  }, wrongChangeBearer), 'PUT')

  await page.getByLabel('Current password').fill(accountPassword)
  const successfulChange = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/me/password') && response.request().method() === 'PUT')
  await page.getByRole('button', { name: 'Change password' }).click()
  check('password-change-success-relogin', (await successfulChange).status()).toBe(204)
  await check('password-change-success-relogin', page).toHaveURL(/\/login\?reason=password-changed/)
  await check('password-change-success-relogin', page.getByRole('status')).toContainText('Sign in again with your new password')

  await page.getByLabel('Email').fill(passwordEmail)
  await page.getByLabel('Password').fill(accountPassword)
  const oldPasswordLogin = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in' }).click()
  check('password-change-success-relogin', (await oldPasswordLogin).status()).toBe(401)
  await observeNegative('password-change-success-relogin', await page.request.post(`${applicationOrigin}/api/v1/auth/login`, {
    data: { email: passwordEmail, password: accountPassword },
    headers: { Origin: applicationOrigin, Accept: 'application/json' },
  }))
  await check('password-change-success-relogin', page.getByRole('alert')).toContainText('Email or password is incorrect')
  await page.getByLabel('Password').fill(changedPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await check('password-change-success-relogin', page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
  const revokedPasswordSession = await passwordSecondContext.request.post(`${applicationOrigin}/api/v1/auth/refresh`, {
    headers: { Origin: applicationOrigin, Accept: 'application/json' },
  })
  await observeNegative('password-change-success-relogin', revokedPasswordSession)
  await passwordSecondContext.close()

  const googleOnlyContext = await browser.newContext({ baseURL: applicationOrigin, viewport: { width: 1440, height: 900 } })
  const googleOnlyPage = await googleOnlyContext.newPage()
  const googleOnlyNonce = `${suffix}g`.slice(-16).padStart(8, '0')
  const googleOnlyEmail = googleProfileEmail('google-only', googleOnlyNonce)
  await setGoogleProfile(googleOnlyContext, googleProfile('google-only', googleOnlyNonce))
  await googleOnlyPage.goto('/login')
  await googleOnlyPage.getByRole('link', { name: 'Continue with Google', exact: true }).click()
  await check('password-setup-google-only', googleOnlyPage.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
  await googleOnlyPage.goto('/account#login-methods')
  await check('password-setup-google-only', googleOnlyPage.getByText(/Connected:/).locator('..')).toContainText('GOOGLE')
  await check('password-setup-google-only', googleOnlyPage.getByRole('button', { name: 'Unlink Google' })).toHaveCount(0)

  const googleOnlyProbeContext = await browser.newContext({ baseURL: applicationOrigin, viewport: { width: 1440, height: 900 } })
  const googleOnlyProbePage = await googleOnlyProbeContext.newPage()
  await setGoogleProfile(googleOnlyProbeContext, googleProfile('google-only', googleOnlyNonce))
  await googleOnlyProbePage.goto('/login')
  await googleOnlyProbePage.getByRole('link', { name: 'Continue with Google', exact: true }).click()
  await expect(googleOnlyProbePage.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()

  const lastMethodResponse = await authenticatedPost(googleOnlyProbeContext, '/api/v1/auth/me/login-methods/google/unlink', { currentPassword: 'not-a-local-password' })
  await observeNegative('provider-unlink-last-method', lastMethodResponse)
  check('provider-unlink-last-method', lastMethodResponse.status()).toBe(409)

  const setupMessageBaseline = await mailMessageCount(googleOnlyEmail)
  await googleOnlyPage.getByRole('button', { name: 'Send setup code' }).click()
  await check('password-setup-cooldown', googleOnlyPage.getByRole('button', { name: /Send another code in \d+s/ })).toBeDisabled()
  await expect.poll(() => mailMessageCount(googleOnlyEmail), { timeout: 10_000 }).toBe(setupMessageBaseline + 1)
  check('password-setup-cooldown', await mailMessageCount(googleOnlyEmail)).toBe(setupMessageBaseline + 1)
  const setupOtp = await latestMailOtp(googleOnlyEmail, setupMessageBaseline + 1)
  const invalidSetupOtp = setupOtp === '000000' ? '000001' : '000000'
  await googleOnlyPage.getByLabel('Verification code').fill(invalidSetupOtp)
  await googleOnlyPage.getByRole('textbox', { name: 'New password', exact: true }).fill(accountPassword)
  const invalidSetupBearer = await currentBearer(googleOnlyProbeContext)
  const invalidSetup = googleOnlyPage.waitForResponse(response => response.url().endsWith('/api/v1/auth/me/password/confirm') && response.request().method() === 'POST')
  await googleOnlyPage.getByRole('button', { name: 'Confirm password' }).click()
  check('password-setup-invalid-code', (await invalidSetup).status()).toBe(400)
  await observeNegative('password-setup-invalid-code', await authenticatedPost(googleOnlyProbeContext, '/api/v1/auth/me/password/confirm', {
    otp: invalidSetupOtp, password: accountPassword,
  }, invalidSetupBearer))
  await check('password-setup-invalid-code', googleOnlyPage.getByText('Verification code is invalid or expired')).toBeVisible()

  await googleOnlyPage.getByLabel('Verification code').fill(setupOtp)
  const successfulSetup = googleOnlyPage.waitForResponse(response => response.url().endsWith('/api/v1/auth/me/password/confirm') && response.request().method() === 'POST')
  await googleOnlyPage.getByRole('button', { name: 'Confirm password' }).click()
  check('password-setup-success', (await successfulSetup).status()).toBe(204)
  await check('password-setup-success', googleOnlyPage.getByRole('heading', { name: 'Change password' })).toBeVisible()
  await check('password-setup-success', googleOnlyPage.getByText('Password login added to your account.')).toBeVisible()
  await signOutAccount(googleOnlyPage)
  await signInAccount(googleOnlyPage, googleOnlyEmail)
  await check('password-setup-success', googleOnlyPage.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
  await googleOnlyContext.close()
  await googleOnlyProbeContext.close()

  const linkContext = await browser.newContext({ baseURL: applicationOrigin, viewport: { width: 1440, height: 900 } })
  const linkPage = await linkContext.newPage()
  const linkNonce = `${suffix}l`.slice(-16).padStart(8, '0')
  const linkEmail = googleProfileEmail('link', linkNonce)
  await registerVerifiedAccount(linkPage, linkEmail, { displayName: 'Provider Link User' })
  const unlinkSecondContext = await browser.newContext({ baseURL: applicationOrigin, viewport: { width: 1440, height: 900 } })
  const unlinkSecondPage = await unlinkSecondContext.newPage()

  await linkPage.goto('/account#login-methods')
  const mismatchNonce = `${suffix}m`.slice(-16).padStart(8, '0')
  await setGoogleProfile(linkContext, googleProfile('mismatch', mismatchNonce))
  await linkPage.getByRole('button', { name: 'Link Google' }).click()
  await check('provider-link-success', linkPage).toHaveURL(/\/auth\/oauth\/callback\?oauth_error=oauth_sign_in_failed/)
  await check('provider-link-success', linkPage.getByText('Google sign-in could not be completed.', { exact: true })).toBeVisible()
  await linkPage.goto('/account#login-methods')
  await setGoogleProfile(linkContext, googleProfile('link', linkNonce))
  await linkPage.getByRole('button', { name: 'Link Google' }).click()
  await check('provider-link-success', linkPage).toHaveURL(/\/auth\/oauth\/callback$/)
  await linkPage.waitForURL(url => url.pathname === '/', { timeout: 10_000 })
  await linkPage.getByRole('button', { name: /Open account menu for/ }).click()
  await linkPage.getByRole('menuitem', { name: 'Account security', exact: true }).click()
  await linkPage.waitForURL(/\/account#security$/)
  await check('provider-link-success', linkPage.getByRole('heading', { name: 'Account security' })).toBeVisible()
  await check('provider-link-success', linkPage.getByText(/Connected:/).locator('..')).toContainText('GOOGLE')
  await check('provider-link-success', linkPage.getByText(/Connected:/).locator('..')).toContainText('PASSWORD')

  // Linking invalidates pre-existing refresh families. Establish the secondary
  // session after that mutation so it can be used to prove unlink revocation.
  await signInAccount(unlinkSecondPage, linkEmail)

  await linkPage.getByRole('button', { name: 'Unlink Google' }).click()
  const unlinkDialog = linkPage.getByRole('dialog', { name: 'Unlink Google?' })
  const noBlankRequest = linkPage.waitForRequest(request => request.url().endsWith('/api/v1/auth/me/login-methods/google/unlink'), { timeout: 500 }).catch(() => null)
  await unlinkDialog.getByRole('button', { name: 'Unlink Google' }).click()
  check('provider-unlink-blank-password', await noBlankRequest).toBeNull()
  await check('provider-unlink-blank-password', unlinkDialog.getByText('Enter your current password to unlink Google.')).toBeVisible()
  const blankUnlink = await authenticatedPost(unlinkSecondContext, '/api/v1/auth/me/login-methods/google/unlink', { currentPassword: '' })
  await observeNegative('provider-unlink-blank-password', blankUnlink)

  await unlinkDialog.getByLabel('Current password').fill('wrong-current-password')
  const wrongUnlinkBearer = await currentBearer(unlinkSecondContext)
  const wrongUnlink = linkPage.waitForResponse(response => response.url().endsWith('/api/v1/auth/me/login-methods/google/unlink') && response.request().method() === 'POST')
  await unlinkDialog.getByRole('button', { name: 'Unlink Google' }).click()
  check('provider-unlink-wrong-password', (await wrongUnlink).status()).toBe(401)
  await observeNegative('provider-unlink-wrong-password', await authenticatedPost(unlinkSecondContext, '/api/v1/auth/me/login-methods/google/unlink', {
    currentPassword: 'wrong-current-password',
  }, wrongUnlinkBearer))
  await check('provider-unlink-wrong-password', unlinkDialog.getByText('Current password is incorrect')).toBeVisible()

  await unlinkDialog.getByLabel('Current password').fill(accountPassword)
  const successfulUnlink = linkPage.waitForResponse(response => response.url().endsWith('/api/v1/auth/me/login-methods/google/unlink') && response.request().method() === 'POST')
  await unlinkDialog.getByRole('button', { name: 'Unlink Google' }).click()
  check('provider-unlink-success-revocation', (await successfulUnlink).status()).toBe(204)
  await check('provider-unlink-success-revocation', linkPage).toHaveURL(/\/login\?reason=google-unlinked/)
  await check('provider-unlink-success-revocation', linkPage.getByRole('status')).toContainText('Google was removed')
  const revokedUnlinkSession = await unlinkSecondContext.request.post(`${applicationOrigin}/api/v1/auth/refresh`, {
    headers: { Origin: applicationOrigin, Accept: 'application/json' },
  })
  await observeNegative('provider-unlink-success-revocation', revokedUnlinkSession)
  await unlinkSecondContext.close()

  await signInAccount(linkPage, linkEmail)
  await linkPage.goto('/account#login-methods')
  await check('provider-unlink-success-revocation', linkPage.getByText(/Connected:/).locator('..')).toContainText('PASSWORD')
  await check('provider-unlink-success-revocation', linkPage.getByText(/Connected:/).locator('..')).not.toContainText('GOOGLE')
  await signOutAccount(linkPage)
  await setGoogleProfile(linkContext, googleProfile('link', linkNonce))
  await linkPage.getByRole('link', { name: 'Continue with Google', exact: true }).click()
  await check('provider-unlink-success-revocation', linkPage).toHaveURL(/\/auth\/oauth\/callback\?oauth_error=oauth_sign_in_failed/)
  await check('provider-unlink-success-revocation', linkPage.getByText('Google sign-in could not be completed.', { exact: true })).toBeVisible()
  await linkContext.close()

  for (const caseId of caseIds) check(caseId, assertionTotals.get(caseId)).toBeGreaterThan(0)
  check('password-setup-cooldown', await mailMessageCount(googleOnlyEmail)).toBe(setupMessageBaseline + 1)
  expect(observedNegatives).toHaveLength(expectedNegatives.length)
  const negativeTuple = (entry: NegativeContract) => `${entry.case_id}|${entry.method}|${entry.path}|${entry.status}|${entry.problem_code}`
  expect(observedNegatives.map(entry => ({
    case_id: entry.case_id,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    problem_code: entry.problem_code,
  })).sort((left, right) => negativeTuple(left).localeCompare(negativeTuple(right))))
    .toEqual([...expectedNegatives].sort((left, right) => negativeTuple(left).localeCompare(negativeTuple(right))))

  const cases = caseIds.map(id => ({
    id,
    viewport,
    status: 'passed',
    assertions_total: assertionTotals.get(id),
    assertions_failed: 0,
  }))
  const assertionsTotal = cases.reduce((sum, item) => sum + (item.assertions_total ?? 0), 0)
  const sidecar = {
    schema_version: 1,
    phase: 'P6',
    suite: 'account-security',
    generated_at_utc: new Date().toISOString(),
    sanitized: true,
    assertions: { total: assertionsTotal, failed: 0 },
    cases,
    network: {
      expected_negative_allowlist: expectedNegatives,
      observed_negative_events: observedNegatives,
    },
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(sidecar, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
})
