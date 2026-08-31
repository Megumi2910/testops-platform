import { promises as fs } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

const fullRevision = /^[0-9a-f]{40}$/

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for the retained-swap contract.`)
  return value
}

async function readJson(file: string) {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>
}

test('a retained revision-A tab reloads exactly once onto revision B', async ({ page }) => {
  const controlDirectory = path.resolve(requiredEnvironment('RETAINED_SWAP_CONTROL_DIR'))
  const runId = requiredEnvironment('RETAINED_SWAP_RUN_ID')
  const revisionA = requiredEnvironment('RETAINED_SWAP_REVISION_A').toLowerCase()
  const revisionB = requiredEnvironment('RETAINED_SWAP_REVISION_B').toLowerCase()
  const finalMarkerTestId = requiredEnvironment('RETAINED_SWAP_FINAL_MARKER_TEST_ID')
  const finalMarkerText = process.env.RETAINED_SWAP_FINAL_MARKER_TEXT?.trim()
  const coordinationTimeout = Number(process.env.RETAINED_SWAP_COORDINATION_TIMEOUT_MS ?? 180_000)

  expect(revisionA).toMatch(fullRevision)
  expect(revisionB).toMatch(fullRevision)
  expect(revisionB).not.toBe(revisionA)

  await fs.mkdir(controlDirectory, { recursive: true })

  let swapActive = false
  let documentReloads = 0
  let staleChunk404s = 0
  let finalDocumentRevision = ''
  let unexpectedSecondDocument: (() => void) | undefined
  const secondDocument = new Promise<void>((resolve) => { unexpectedSecondDocument = resolve })

  page.on('request', (request) => {
    if (!swapActive || request.resourceType() !== 'document') return
    documentReloads += 1
    if (documentReloads > 1) unexpectedSecondDocument?.()
  })
  page.on('response', (response) => {
    if (!swapActive) return
    const request = response.request()
    if (request.resourceType() === 'document') {
      finalDocumentRevision = response.headers()['x-testops-revision'] ?? ''
    }
    if (
      request.resourceType() === 'script'
      && response.status() === 404
      && new URL(response.url()).pathname.startsWith('/assets/')
    ) {
      staleChunk404s += 1
    }
  })

  const initialResponse = await page.goto('/')
  expect(initialResponse?.status()).toBe(200)
  expect(initialResponse?.headers()['x-testops-revision']).toBe(revisionA)
  await expect(page.getByRole('heading', { name: 'Browser checks you can trust.' })).toBeVisible()
  await expect(page.getByTestId(finalMarkerTestId)).toHaveCount(0)

  await fs.writeFile(path.join(controlDirectory, 'retained-a-ready.json'), JSON.stringify({
    schema_version: 1,
    phase: 'P6',
    run_id: runId,
    revision_a: revisionA,
    revision_b: revisionB,
    sanitized: true,
    status: 'retained-a-ready',
  }), 'utf8')

  const revisionBReadyPath = path.join(controlDirectory, 'revision-b-ready.json')
  await expect.poll(async () => {
    try {
      const ready = await readJson(revisionBReadyPath)
      return ready.run_id === runId && ready.revision_b === revisionB && ready.status === 'revision-b-ready'
    } catch {
      return false
    }
  }, {
    message: 'revision B did not become healthy before the coordination deadline',
    timeout: coordinationTimeout,
    intervals: [100, 250, 500, 1_000],
  }).toBe(true)

  swapActive = true
  await page.locator('.primary-nav').getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/login(?:[?#].*)?$/)
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  const finalMarker = page.getByTestId(finalMarkerTestId)
  await expect(finalMarker).toBeVisible()
  if (finalMarkerText) await expect(finalMarker).toContainText(finalMarkerText)

  await expect.poll(() => ({ documentReloads, staleChunk404s, finalDocumentRevision }), {
    message: 'the retained tab did not complete the exact one-shot recovery contract',
    timeout: 15_000,
    intervals: [100, 250, 500],
  }).toEqual({ documentReloads: 1, staleChunk404s: 1, finalDocumentRevision: revisionB })

  const recoveryMarker = await page.evaluate((key) => window.sessionStorage.getItem(key),
    `testops:lazy-route-recovery:${revisionA}:/login`)
  expect(recoveryMarker).toBe('1')

  // This bounded quiescence window is a no-loop assertion, not a readiness
  // delay. Readiness above is driven by the revision-B health sentinel.
  const remainedStable = await Promise.race([
    secondDocument.then(() => false),
    page.evaluate(() => new Promise<boolean>((resolve) => window.setTimeout(() => resolve(true), 2_000))),
  ])
  expect(remainedStable).toBe(true)
  expect(documentReloads).toBe(1)

  await fs.writeFile(path.join(controlDirectory, 'retained-swap-result.json'), JSON.stringify({
    schema_version: 1,
    phase: 'P6',
    run_id: runId,
    revision_a: revisionA,
    revision_b: revisionB,
    sanitized: true,
    document_reloads: documentReloads,
    stale_chunk_404s: staleChunk404s,
    final_document_revision: finalDocumentRevision,
    recovery_marker_a: recoveryMarker === '1',
    final_marker_b: true,
    reload_loop: false,
    status: 'passed',
  }), 'utf8')
})
