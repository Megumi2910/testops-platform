import { expect, test, type Page } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

const targetOrigin = 'http://localhost:3201'

async function authenticatedJson(page: Page, path: string) {
  return page.evaluate(async endpoint => {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    const session = await refresh.json() as { accessToken: string }
    const response = await fetch(endpoint, { credentials: 'include', headers: { Authorization: `Bearer ${session.accessToken}` } })
    return { status: response.status, body: await response.text() }
  }, path)
}

async function authenticatedArtifact(page: Page, path: string) {
  return page.evaluate(async endpoint => {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    const session = await refresh.json() as { accessToken: string }
    const response = await fetch(endpoint, { credentials: 'include', headers: { Authorization: `Bearer ${session.accessToken}` } })
    const bytes = await response.arrayBuffer()
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      disposition: response.headers.get('content-disposition'),
      byteLength: bytes.byteLength,
    }
  }, path)
}

async function createProjectSuiteCase(page: Page, runId: number) {
  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  const projectName = `Artifact project ${runId}`
  await page.getByLabel('Name').fill(projectName)
  await page.getByLabel('Target origin').selectOption({ label: targetOrigin })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)
  const projectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1]
  expect(projectId).toBeTruthy()

  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  const suiteName = `Artifact suite ${runId}`
  await page.getByRole('textbox', { name: 'Suite name' }).fill(suiteName)
  await page.getByRole('button', { name: 'Add suite' }).click()
  await page.getByRole('link', { name: new RegExp(suiteName) }).click()
  const suiteId = page.url().match(/\/suites\/([0-9a-f-]+)$/)?.[1]
  expect(suiteId).toBeTruthy()

  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill(`Artifact case ${runId}`)
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.locator('fieldset.step-card').nth(0).getByLabel('Input value').fill('/')
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.locator('fieldset.step-card').nth(1).getByLabel('Action').selectOption('TAKE_SCREENSHOT')
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/suites/${suiteId}/cases/[0-9a-f-]+$`))
  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  await page.locator(`a[href$="/suites/${suiteId}"]`).click()
  return { projectId: projectId!, suiteId: suiteId! }
}

test('members can download evidence while non-members are denied before file access', async ({ page }) => {
  test.setTimeout(90_000)
  const runId = Date.now()
  await registerAndVerify(page, `phase5-artifact-member-${runId}@example.test`)
  const { projectId } = await createProjectSuiteCase(page, runId)

  await page.getByRole('button', { name: 'Run ready cases', exact: true }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'PASSED', exact: true })).toBeVisible({ timeout: 30_000 })
  const executionId = page.url().match(/\/executions\/([0-9a-f-]+)$/)?.[1]
  expect(executionId).toBeTruthy()

  const detailResponse = await authenticatedJson(page, `/api/v1/projects/${projectId}/executions/${executionId}`)
  expect(detailResponse.status).toBe(200)
  const detail = JSON.parse(detailResponse.body) as { artifacts: Array<{ id: string; type: string; caseResultId?: string }> }
  const screenshot = detail.artifacts.find(artifact => artifact.type === 'SCREENSHOT')
  const trace = detail.artifacts.find(artifact => artifact.type === 'TRACE')
  expect(screenshot).toBeTruthy()
  expect(trace).toBeTruthy()

  const screenshotDownload = await authenticatedArtifact(page, `/api/v1/projects/${projectId}/executions/${executionId}/artifacts/${screenshot!.id}`)
  expect(screenshotDownload.status).toBe(200)
  expect(screenshotDownload.contentType).toContain('image/png')
  expect(screenshotDownload.disposition).toMatch(/^inline;/)
  expect(screenshotDownload.byteLength).toBeGreaterThan(0)

  const traceDownload = await authenticatedArtifact(page, `/api/v1/projects/${projectId}/executions/${executionId}/artifacts/${trace!.id}`)
  expect(traceDownload.status).toBe(200)
  expect(traceDownload.contentType).toContain('application/zip')
  expect(traceDownload.disposition).toMatch(/^attachment;/)
  expect(traceDownload.byteLength).toBeGreaterThan(0)

  const browser = page.context().browser()
  expect(browser).toBeTruthy()
  const outsiderContext = await browser!.newContext({ baseURL: new URL(page.url()).origin })
  try {
    const outsiderPage = await outsiderContext.newPage()
    await registerAndVerify(outsiderPage, `phase5-artifact-outsider-${runId}@example.test`)
    const denied = await authenticatedArtifact(outsiderPage, `/api/v1/projects/${projectId}/executions/${executionId}/artifacts/${screenshot!.id}`)
    expect(denied.status).toBe(403)
    expect(denied.byteLength).toBeGreaterThan(0)
  } finally {
    await outsiderContext.close()
  }
})
