import { expect, test, type Page } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

const targetOrigin = 'http://localhost:3201'

async function authenticatedExecution(page: Page, endpoint: string) {
  return page.evaluate(async path => {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    const session = await refresh.json() as { accessToken: string }
    const response = await fetch(path, { credentials: 'include', headers: { Authorization: `Bearer ${session.accessToken}` } })
    return { status: response.status, body: await response.text() }
  }, endpoint)
}

async function createProjectAndSuite(page: Page, prefix: string) {
  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  const projectName = `${prefix} project ${Date.now()}`
  await page.getByLabel('Name').fill(projectName)
  await page.getByLabel('Target origin').selectOption({ label: targetOrigin })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)
  const projectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1]
  expect(projectId).toBeTruthy()
  await page.getByRole('link', { name: 'Variables', exact: true }).click()
  const suiteName = `${prefix} suite ${Date.now()}`
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.getByRole('textbox', { name: 'Suite name' }).fill(suiteName)
  await page.getByRole('button', { name: 'Add suite' }).click()
  await page.getByRole('link', { name: new RegExp(suiteName) }).click()
  const suiteId = page.url().match(/\/suites\/([0-9a-f-]+)$/)?.[1]
  expect(suiteId).toBeTruthy()
  return { projectId: projectId!, suiteId: suiteId! }
}

async function addVariable(page: Page, key: string, value: string, secret: boolean) {
  await page.getByRole('link', { name: 'Variables', exact: true }).click()
  await page.getByLabel('Variable key').fill(key)
  await page.getByLabel('Variable value').fill(value)
  if (secret) await page.getByRole('checkbox', { name: 'Secret' }).check()
  await page.getByRole('button', { name: 'Save variable', exact: true }).click()
  await expect(page.getByText(key, { exact: true })).toBeVisible()
  if (secret) await expect(page.getByText(value, { exact: true })).toHaveCount(0)
}

async function createVariableCase(page: Page, projectId: string, suiteId: string, name: string, variableKey: string) {
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.locator(`a[href$="/suites/${suiteId}"]`).click()
  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.locator('fieldset.step-card').nth(0).getByLabel('Input value').fill('/')
  await page.getByRole('button', { name: 'Add step' }).click()
  const fillStep = page.locator('fieldset.step-card').nth(1)
  await fillStep.getByLabel('Action').selectOption('FILL')
  await fillStep.getByRole('combobox', { name: 'Locator' }).selectOption('LABEL')
  await fillStep.getByLabel('Locator value').fill('Tìm kiếm sản phẩm, thương hiệu...')
  await fillStep.getByLabel('Input value').fill(`$\{${variableKey}}`)
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.locator('fieldset.step-card').nth(2).getByLabel('Action').selectOption('TAKE_SCREENSHOT')
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/suites/${suiteId}/cases/[0-9a-f-]+$`))
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.locator(`a[href$="/suites/${suiteId}"]`).click()
}

async function createSecretFailureCase(page: Page, projectId: string, suiteId: string, name: string, variableKey: string) {
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.locator(`a[href$="/suites/${suiteId}"]`).click()
  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.locator('fieldset.step-card').nth(0).getByLabel('Input value').fill('/')
  await page.getByRole('button', { name: 'Add step' }).click()
  const fillStep = page.locator('fieldset.step-card').nth(1)
  await fillStep.getByLabel('Action').selectOption('FILL')
  await fillStep.getByRole('combobox', { name: 'Locator' }).selectOption('LABEL')
  await fillStep.getByLabel('Locator value').fill('Tìm kiếm sản phẩm, thương hiệu...')
  await fillStep.getByLabel('Input value').fill(`$\{${variableKey}}`)
  await page.getByRole('button', { name: 'Add step' }).click()
  const assertionStep = page.locator('fieldset.step-card').nth(2)
  await assertionStep.getByLabel('Action').selectOption('ASSERT_VISIBLE')
  await assertionStep.getByRole('combobox', { name: 'Locator' }).selectOption('TEXT')
  await assertionStep.getByLabel('Locator value').fill('This text is intentionally missing')
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/suites/${suiteId}/cases/[0-9a-f-]+$`))
}

test('secret variables suppress evidence while non-secret variables retain screenshot and trace artifacts', async ({ page }) => {
  test.setTimeout(90_000)
  const runId = Date.now()
  await registerAndVerify(page, `phase5-evidence-${runId}@example.test`)
  const { projectId, suiteId } = await createProjectAndSuite(page, 'Evidence safety')
  const secretKey = `QA_SECRET_${runId}`
  const secretValue = `do-not-persist-${runId}`
  const plainKey = `QA_PLAIN_${runId}`
  await addVariable(page, secretKey, secretValue, true)
  await addVariable(page, plainKey, `safe-${runId}`, false)
  await createVariableCase(page, projectId, suiteId, `Secret evidence ${runId}`, secretKey)
  await createVariableCase(page, projectId, suiteId, `Plain evidence ${runId}`, plainKey)
  await page.getByRole('button', { name: 'Run ready cases', exact: true }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'PASSED', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Preview screenshot', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download trace', exact: true })).toBeVisible()

  const executionId = page.url().match(/\/executions\/([0-9a-f-]+)$/)?.[1]
  expect(executionId).toBeTruthy()
  const response = await authenticatedExecution(page, `/api/v1/projects/${projectId}/executions/${executionId}`)
  expect(response.status).toBe(200)
  const execution = JSON.parse(response.body) as { cases: Array<{ caseName: string; id: string }>; artifacts: Array<{ caseResultId?: string; type: string; secretSuppressed: boolean }> }
  const secretCase = execution.cases.find(item => item.caseName === `Secret evidence ${runId}`)
  const plainCase = execution.cases.find(item => item.caseName === `Plain evidence ${runId}`)
  expect(secretCase).toBeTruthy()
  expect(plainCase).toBeTruthy()
  expect(execution.artifacts.filter(item => item.caseResultId === secretCase!.id)).toHaveLength(0)
  const plainArtifacts = execution.artifacts.filter(item => item.caseResultId === plainCase!.id)
  expect(plainArtifacts.map(item => item.type)).toEqual(expect.arrayContaining(['SCREENSHOT', 'TRACE']))
  expect(execution.artifacts.every(item => item.secretSuppressed === false)).toBeTruthy()
  expect(JSON.stringify(execution)).not.toContain(secretValue)
})

test('secret-bearing failures suppress failure evidence and sanitize execution details', async ({ page }) => {
  test.setTimeout(90_000)
  const runId = Date.now()
  await registerAndVerify(page, `phase5-secret-failure-${runId}@example.test`)
  const { projectId, suiteId } = await createProjectAndSuite(page, 'Secret failure')
  const secretKey = `QA_FAILURE_SECRET_${runId}`
  const secretValue = `never-persist-${runId}`
  await addVariable(page, secretKey, secretValue, true)
  await createSecretFailureCase(page, projectId, suiteId, `Secret failure ${runId}`, secretKey)
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.locator(`a[href$="/suites/${suiteId}"]`).click()
  await page.getByRole('button', { name: 'Run ready cases', exact: true }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: /FAILED|ERROR/, exact: true })).toBeVisible({ timeout: 30_000 })

  const executionId = page.url().match(/\/executions\/([0-9a-f-]+)$/)?.[1]
  expect(executionId).toBeTruthy()
  const response = await authenticatedExecution(page, `/api/v1/projects/${projectId}/executions/${executionId}`)
  expect(response.status).toBe(200)
  const execution = JSON.parse(response.body) as { cases: Array<{ errorCategory?: string; errorMessage?: string }>; artifacts: unknown[] }
  expect(execution.cases).toHaveLength(1)
  expect(execution.cases[0].errorCategory).toBe('ASSERTION_FAILURE')
  expect(execution.cases[0].errorMessage).not.toContain(secretValue)
  expect(execution.artifacts).toHaveLength(0)
  expect(response.body).not.toContain(secretValue)
})

async function createNavigationCase(page: Page, projectId: string, suiteId: string, name: string, locatorRole: string, locatorName: string) {
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.locator(`a[href$="/suites/${suiteId}"]`).click()
  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.locator('fieldset.step-card').nth(0).getByLabel('Input value').fill('/')
  await page.getByRole('button', { name: 'Add step' }).click()
  const unsafeStep = page.locator('fieldset.step-card').nth(1)
  await unsafeStep.getByLabel('Action').selectOption('CLICK')
  await unsafeStep.getByRole('combobox', { name: 'Locator' }).selectOption('ROLE')
  await unsafeStep.getByLabel('ARIA role').selectOption(locatorRole)
  await unsafeStep.getByLabel('Locator value').fill(locatorName)
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/suites/${suiteId}/cases/[0-9a-f-]+$`))
}

test('click and form navigations outside the target are classified as blocked navigation', async ({ page }) => {
  test.setTimeout(90_000)
  const runId = Date.now()
  await registerAndVerify(page, `phase5-navigation-${runId}@example.test`)
  const { projectId, suiteId } = await createProjectAndSuite(page, 'Navigation safety')
  await createNavigationCase(page, projectId, suiteId, `Click escape ${runId}`, 'LINK', 'Outside target')
  await createNavigationCase(page, projectId, suiteId, `Form escape ${runId}`, 'BUTTON', 'Submit outside form')
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.locator(`a[href$="/suites/${suiteId}"]`).click()
  await page.getByRole('button', { name: 'Run ready cases', exact: true }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'ERROR', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/BLOCKED_NAVIGATION/).first()).toBeVisible()
  const executionId = page.url().match(/\/executions\/([0-9a-f-]+)$/)?.[1]
  expect(executionId).toBeTruthy()
  const response = await authenticatedExecution(page, `/api/v1/projects/${projectId}/executions/${executionId}`)
  expect(response.status).toBe(200)
  const execution = JSON.parse(response.body) as { cases: Array<{ errorCategory?: string; errorMessage?: string }> }
  expect(execution.cases).toHaveLength(2)
  expect(execution.cases.every(item => item.errorCategory === 'BLOCKED_NAVIGATION')).toBeTruthy()
  expect(execution.cases.every(item => item.errorMessage === 'Browser navigation left the approved project target')).toBeTruthy()
})
