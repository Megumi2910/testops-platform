import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

import { expect, test, type Page } from '@playwright/test'

import { registerAndVerify } from './helpers/auth'

const execFile = promisify(execFileCallback)
const targetOrigin = 'http://localhost:3201'

async function createCrashCase(page: Page, runId: number) {
  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  const projectName = `Browser crash project ${runId}`
  await page.getByLabel('Name').fill(projectName)
  await page.getByLabel('Target origin').selectOption({ label: targetOrigin })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)
  const projectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1]
  expect(projectId).toBeTruthy()

  await page.getByRole('link', { name: 'Suites', exact: true }).click()
  const suiteName = `Browser crash suite ${runId}`
  await page.getByRole('textbox', { name: 'Suite name' }).fill(suiteName)
  await page.getByRole('button', { name: 'Add suite' }).click()
  await page.getByRole('link', { name: new RegExp(suiteName) }).click()
  const suiteId = page.url().match(/\/suites\/([0-9a-f-]+)$/)?.[1]
  expect(suiteId).toBeTruthy()

  await page.getByRole('link', { name: 'New case', exact: true }).click()
  await page.getByLabel('Start from a template').selectOption('blank')
  await page.getByLabel('Name').fill(`Browser crash case ${runId}`)
  await page.getByRole('button', { name: 'Continue to steps' }).click()
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.locator('fieldset.step-card').nth(0).getByLabel('Input value').fill('/')
  await page.getByRole('button', { name: 'Add step' }).click()
  const waitStep = page.locator('fieldset.step-card').nth(1)
  await waitStep.getByLabel('Action').selectOption('WAIT_VISIBLE')
  await waitStep.locator('select').nth(1).selectOption('TEXT_EXACT')
  await waitStep.getByLabel('Locator value').fill(`Never appears in browser crash fixture ${runId}`)
  await waitStep.getByLabel('Timeout (ms)').fill('120000')
  await page.getByRole('button', { name: 'Review case' }).click()
  await page.getByRole('button', { name: 'Save as READY', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/suites/${suiteId}/cases/[0-9a-f-]+$`))
  return { projectId: projectId!, suiteId: suiteId! }
}

async function chromiumIsRunning(container: string) {
  try {
    await execFile('docker', ['exec', container, 'sh', '-lc', "pgrep -af '[c]hrom'"], { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

async function terminateChromium(container: string) {
  await execFile('docker', [
    'exec', container, 'sh', '-lc', "pkill -TERM -f '[c]hrom' || true",
  ], { timeout: 10_000 })
}

test('a real Chromium process termination is classified as BROWSER_CRASH', async ({ page }) => {
  test.skip(process.env.E2E_BROWSER_CRASH !== 'true', 'Run only in the isolated browser-crash job')
  test.setTimeout(120_000)

  const container = process.env.E2E_BACKEND_CONTAINER ?? 'testops-e2e-backend-1'
  const runId = Date.now()
  await registerAndVerify(page, `phase5-browser-crash-${runId}@example.test`)
  const { projectId, suiteId } = await createCrashCase(page, runId)

  await page.getByRole('button', { name: 'Run case', exact: true }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: /QUEUED|RUNNING/, exact: false })).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => chromiumIsRunning(container), { timeout: 30_000, intervals: [250, 500, 1_000] }).toBe(true)
  await terminateChromium(container)

  await expect(page.getByRole('heading', { name: 'ERROR', exact: true })).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText(/BROWSER_CRASH/).first()).toBeVisible()
  await expect(page.getByText(/browser has been closed|browser process/i).first()).toBeVisible()
  await expect(page.getByText(/Call log:|stack=|Browser logs:/)).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/executions/[0-9a-f-]+$`))
  expect(suiteId).toMatch(/[0-9a-f-]+/)
})
