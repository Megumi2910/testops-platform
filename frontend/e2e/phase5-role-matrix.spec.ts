import { expect, test, type Browser, type Page } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

const targetOrigin = process.env.E2E_TARGET_ORIGIN ?? 'http://localhost:3201'

async function registerUser(browser: Browser, email: string, displayName: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await registerAndVerify(page, email)
  return { context, page, email, displayName }
}

async function createProject(page: Page, name: string) {
  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Target origin').selectOption({ label: targetOrigin })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

async function createSuite(page: Page, name: string) {
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.getByRole('textbox', { name: 'Suite name' }).fill(name)
  await page.getByRole('button', { name: 'Add suite' }).click()
  await page.getByRole('link', { name: new RegExp(name) }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  return page.url().split('/').pop()!
}

async function createReadyCase(page: Page, name: string) {
  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await expect(page.getByRole('heading', { name: /New case/i })).toBeVisible()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Continue to steps', exact: true }).click()
  await page.getByRole('button', { name: 'Review case', exact: true }).click()
  await page.getByRole('button', { name: 'Save as READY', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

async function addMember(page: Page, email: string, role: string) {
  await page.getByRole('link', { name: 'Members', exact: true }).click()
  await page.getByLabel('Member email').fill(email)
  await page.getByLabel('Member role').selectOption(role)
  await page.getByRole('button', { name: 'Add member', exact: true }).click()
  await expect(page.getByRole('listitem').filter({ hasText: email })).toBeVisible()
}

async function navigateWithoutReload(page: Page, path: string) {
  await page.evaluate(nextPath => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`))
}

test('project roles expose only their permitted definition and execution controls', async ({ page, browser }) => {
  const runId = Date.now()
  const managerEmail = `phase5-manager-${runId}@example.test`
  const testManagerEmail = `phase5-test-manager-${runId}@example.test`
  const testerEmail = `phase5-tester-${runId}@example.test`
  const viewerEmail = `phase5-viewer-${runId}@example.test`
  const nonMemberEmail = `phase5-non-member-${runId}@example.test`

  await registerAndVerify(page, managerEmail)
  const testManager = await registerUser(browser, testManagerEmail, 'Phase 5 test manager')
  const tester = await registerUser(browser, testerEmail, 'Phase 5 tester')
  const viewer = await registerUser(browser, viewerEmail, 'Phase 5 viewer')
  const nonMember = await registerUser(browser, nonMemberEmail, 'Phase 5 non-member')

  const projectId = await createProject(page, `Phase 5 roles ${runId}`)
  const suiteId = await createSuite(page, `Phase 5 role suite ${runId}`)
  await addMember(page, testManagerEmail, 'TEST_MANAGER')
  await addMember(page, testerEmail, 'TESTER')
  await addMember(page, viewerEmail, 'VIEWER')

  for (const [account, expectations] of [
    [testManager, { canCreate: true, canRun: true }],
    [tester, { canCreate: false, canRun: true }],
    [viewer, { canCreate: false, canRun: false }],
  ] as const) {
    await navigateWithoutReload(account.page, `/projects/${projectId}/suites/${suiteId}`)
    await expect(account.page.getByRole('heading', { name: new RegExp(`Phase 5 role suite ${runId}`) })).toBeVisible()
    await expect(account.page.getByRole('link', { name: 'New case', exact: true })).toHaveCount(expectations.canCreate ? 1 : 0)
    await expect(account.page.getByRole('button', { name: 'Run ready cases', exact: true })).toHaveCount(expectations.canRun ? 1 : 0)
    await expect(account.page.getByRole('link', { name: 'Members', exact: true })).toHaveCount(0)
    await expect(account.page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
    await account.page.goto('/admin/users')
    await expect(account.page).toHaveURL(/\/dashboard$/)
    await expect(account.page.getByRole('heading', { name: 'Execution dashboard', exact: true })).toBeVisible()
    await expect(account.page.getByRole('heading', { name: 'Users', exact: true })).toHaveCount(0)
  }

  await navigateWithoutReload(nonMember.page, `/projects/${projectId}`)
  await expect(nonMember.page.getByRole('alert')).toContainText('Unable to load this project')
  await nonMember.page.goto('/admin/users')
  await expect(nonMember.page).toHaveURL(/\/dashboard$/)
  await expect(nonMember.page.getByRole('heading', { name: 'Users', exact: true })).toHaveCount(0)

  await Promise.all([testManager.context.close(), tester.context.close(), viewer.context.close(), nonMember.context.close()])
})

test('a project member cannot substitute a suite identifier from another project', async ({ page, browser }) => {
  const runId = Date.now()
  const managerEmail = `phase5-isolation-manager-${runId}@example.test`
  const foreignEmail = `phase5-isolation-foreign-${runId}@example.test`

  await registerAndVerify(page, managerEmail)
  const foreign = await registerUser(browser, foreignEmail, 'Phase 5 isolated manager')
  const primaryProjectId = await createProject(page, `Phase 5 primary ${runId}`)
  const primarySuiteId = await createSuite(page, `Phase 5 primary suite ${runId}`)
  await createProject(foreign.page, `Phase 5 isolated ${runId}`)
  const foreignSuiteId = await createSuite(foreign.page, `Phase 5 isolated suite ${runId}`)

  const responsePromise = page.waitForResponse(response => response.url().includes(`/api/v1/projects/${primaryProjectId}/suites/${foreignSuiteId}`))
  await navigateWithoutReload(page, `/projects/${primaryProjectId}/suites/${foreignSuiteId}`)
  const response = await responsePromise
  expect(response.status()).toBe(404)
  await expect(page.getByRole('alert')).toContainText('Unable to load this suite')

  await navigateWithoutReload(page, `/projects/${primaryProjectId}/suites/${primarySuiteId}`)
  await expect(page.getByRole('heading', { name: new RegExp(`Phase 5 primary suite ${runId}`) })).toBeVisible()
  await foreign.context.close()
})

test('a project member cannot substitute a case identifier from another suite', async ({ page, browser }) => {
  const runId = Date.now()
  const managerEmail = `phase5-case-isolation-manager-${runId}@example.test`
  const foreignEmail = `phase5-case-isolation-foreign-${runId}@example.test`

  await registerAndVerify(page, managerEmail)
  const foreign = await registerUser(browser, foreignEmail, 'Phase 5 isolated case owner')
  const primaryProjectId = await createProject(page, `Phase 5 case primary ${runId}`)
  const primarySuiteId = await createSuite(page, `Phase 5 case primary suite ${runId}`)
  const primaryCaseId = await createReadyCase(page, `Phase 5 primary case ${runId}`)
  await createProject(foreign.page, `Phase 5 case isolated ${runId}`)
  await createSuite(foreign.page, `Phase 5 case isolated suite ${runId}`)
  const foreignCaseId = await createReadyCase(foreign.page, `Phase 5 isolated case ${runId}`)

  const responsePromise = page.waitForResponse(response => response.url().includes(
    `/api/v1/projects/${primaryProjectId}/suites/${primarySuiteId}/cases/${foreignCaseId}`,
  ))
  await navigateWithoutReload(page,
    `/projects/${primaryProjectId}/suites/${primarySuiteId}/cases/${foreignCaseId}`)
  expect((await responsePromise).status()).toBe(404)
  await expect(page.getByRole('alert')).toContainText('Unable to load this case')

  await navigateWithoutReload(page, `/projects/${primaryProjectId}/suites/${primarySuiteId}/cases/${primaryCaseId}`)
  await expect(page.getByRole('heading', { name: new RegExp(`Phase 5 primary case ${runId}`) })).toBeVisible()
  await foreign.context.close()
})
