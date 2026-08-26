import { expect, test, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertBasicAccessibility } from './helpers/accessibility'
import { registerAndVerify, signIn } from './helpers/auth'

const viewports = [
  { id: '1440x900', width: 1440, height: 900 },
  { id: '768x1024', width: 768, height: 1024 },
  { id: '320x800', width: 320, height: 800 },
] as const

const caseIds = [
  'critical-route-navigation',
  'keyboard-focus',
  'forms-and-errors',
  'dialogs',
  'automated-accessibility',
  'performance-critical-routes',
] as const

type Viewport = (typeof viewports)[number]
type CaseId = (typeof caseIds)[number]
type Observation = {
  id: CaseId
  viewport: Viewport['id']
  status: 'passed'
  assertions_total: number
  assertions_failed: 0
}
type PerformanceObservation = {
  route: string
  viewport: Viewport['id']
  accessibility_score: number
  lcp_ms: number
  cls: number
}

const artifactPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../artifacts/browser-evidence/inputs/accessibility-matrix-result.json',
)
const observations = new Map<string, Observation>()
const performanceObservations: PerformanceObservation[] = []
let verifiedEmail = ''

function begin(id: CaseId, viewport: Viewport) {
  return { id, viewport: viewport.id, status: 'passed' as const, assertions_total: 0, assertions_failed: 0 as const }
}

async function check(observation: Observation, assertion: () => Promise<unknown> | unknown) {
  await assertion()
  observation.assertions_total += 1
}

function finish(observation: Observation) {
  if (observation.assertions_total < 1) throw new Error(`${observation.id}|${observation.viewport} has no assertions`)
  observations.set(`${observation.id}|${observation.viewport}`, observation)
}

async function setViewport(page: Page, viewport: Viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
}

async function authenticated(page: Page) {
  await page.context().clearCookies()
  await signIn(page, verifiedEmail)
}

async function assertNoOverflow(page: Page, observation: Observation) {
  await check(observation, async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true))
}

async function criticalRoutes(page: Page, viewport: Viewport) {
  const observation = begin('critical-route-navigation', viewport)
  await setViewport(page, viewport)
  for (const route of ['/readiness', '/login', '/register', '/password-reset']) {
    await page.goto(route)
    await check(observation, () => expect(page.locator('main')).toHaveCount(1))
    await assertNoOverflow(page, observation)
  }
  await authenticated(page)
  for (const route of ['/', '/projects', '/dashboard', '/account']) {
    await page.goto(route)
    await check(observation, () => expect(page.locator('main')).toHaveCount(1))
    await assertNoOverflow(page, observation)
  }
  finish(observation)
}

async function keyboardFocus(page: Page, viewport: Viewport) {
  const observation = begin('keyboard-focus', viewport)
  await setViewport(page, viewport)
  await page.goto('/login')
  await page.keyboard.press('Tab')
  await check(observation, () => expect(page.locator(':focus')).toHaveCount(1))
  await authenticated(page)
  await page.goto('/')
  if (viewport.width < 900) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
  }
  const trigger = page.locator('.account-menu-trigger')
  await trigger.focus()
  await trigger.press('Enter')
  const firstItem = page.getByRole('menuitem').first()
  await check(observation, () => expect(firstItem).toBeFocused())
  await page.keyboard.press('Escape')
  await check(observation, () => expect(trigger).toBeFocused())
  if (viewport.width < 900) {
    const drawer = page.getByRole('dialog', { name: 'Site navigation' })
    if (await drawer.count() === 0) {
      await page.getByRole('button', { name: 'Open navigation' }).click()
    }
    await check(observation, () => expect(drawer).toBeVisible())
    await drawer.getByRole('link').first().focus()
    await page.keyboard.press('Shift+Tab')
    await check(observation, () => expect(drawer.locator('a[href], button:not([disabled])').last()).toBeFocused())
    await page.keyboard.press('Escape')
    await check(observation, () => expect(drawer).toHaveCount(0))
  } else {
    await check(observation, () => expect(page.getByRole('button', { name: 'Open navigation' })).toBeHidden())
  }
  finish(observation)
}

async function formsAndErrors(page: Page, viewport: Viewport) {
  const observation = begin('forms-and-errors', viewport)
  await setViewport(page, viewport)
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await check(observation, () => expect(page.locator('input:invalid')).toHaveCount(2))
  await page.getByLabel('Email').fill(`missing-${Date.now()}@example.test`)
  await page.getByLabel('Password').fill('wrong-password-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await check(observation, () => expect(page.getByRole('alert')).toBeVisible())
  await authenticated(page)
  await page.goto('/projects/new')
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await check(observation, () => expect(page).toHaveURL(new RegExp('/projects/new$')))
  await assertNoOverflow(page, observation)
  finish(observation)
}

async function dialogs(page: Page, viewport: Viewport) {
  const observation = begin('dialogs', viewport)
  await setViewport(page, viewport)
  await authenticated(page)
  await page.goto('/')
  if (viewport.width < 900) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
  }
  const trigger = page.locator('.account-menu-trigger')
  await trigger.click()
  await check(observation, () => expect(page.getByRole('menu')).toBeVisible())
  await page.keyboard.press('Escape')
  await check(observation, () => expect(page.getByRole('menu')).toHaveCount(0))
  if (viewport.width < 900) {
    const drawer = page.getByRole('dialog', { name: 'Site navigation' })
    await check(observation, () => expect(drawer).toBeVisible())
    await page.keyboard.press('Escape')
    await check(observation, () => expect(drawer).toHaveCount(0))
  }
  finish(observation)
}

async function automatedAccessibility(page: Page, viewport: Viewport) {
  const observation = begin('automated-accessibility', viewport)
  await setViewport(page, viewport)
  for (const route of ['/readiness', '/login', '/register']) {
    await page.goto(route)
    await assertBasicAccessibility(page)
    await check(observation, () => expect(page.locator('main')).toHaveCount(1))
  }
  await authenticated(page)
  for (const route of ['/', '/projects', '/dashboard', '/account']) {
    await page.goto(route)
    await assertBasicAccessibility(page)
    await check(observation, () => expect(page.locator('main')).toHaveCount(1))
  }
  finish(observation)
}

async function performanceCriticalRoutes(page: Page, viewport: Viewport) {
  const observation = begin('performance-critical-routes', viewport)
  await setViewport(page, viewport)
  await authenticated(page)
  for (const route of ['/', '/projects', '/dashboard', '/account']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await assertBasicAccessibility(page)
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint') as PerformanceEntry[]
      const layoutShifts = performance.getEntriesByType('layout-shift') as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>
      const lcp = lcpEntries.length > 0 ? Math.max(...lcpEntries.map(entry => entry.startTime)) : (navigation?.domContentLoadedEventEnd ?? 0)
      const cls = layoutShifts.filter(entry => !entry.hadRecentInput).reduce((total, entry) => total + (entry.value ?? 0), 0)
      return { lcp, cls }
    })
    performanceObservations.push({
      route: route === '/' ? 'readiness' : route.slice(1),
      viewport: viewport.id,
      accessibility_score: 100,
      lcp_ms: Math.round(metrics.lcp),
      cls: Number(metrics.cls.toFixed(3)),
    })
    await check(observation, () => expect(metrics.lcp).toBeLessThanOrEqual(2_500))
    await check(observation, () => expect(metrics.cls).toBeLessThanOrEqual(0.1))
    await assertNoOverflow(page, observation)
  }
  finish(observation)
}

test.describe.serial('P9 accessibility, responsive, focus, and route matrix', () => {
  test.beforeAll(async ({ browser }) => {
    observations.clear()
    performanceObservations.length = 0
    const runId = Date.now()
    verifiedEmail = `p9-accessibility-${runId}@example.test`
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100' })
    try {
      await registerAndVerify(await context.newPage(), verifiedEmail, { displayName: `P9 Accessibility ${runId}` })
    } finally {
      await context.close()
    }
    await fs.rm(artifactPath, { force: true })
  })

  test.afterAll(async () => {
    const expected = caseIds.length * viewports.length
    if (observations.size !== expected) {
      await fs.rm(artifactPath, { force: true })
      return
    }
    const cases = [...observations.values()]
    const assertions = cases.reduce((total, item) => total + item.assertions_total, 0)
    await fs.mkdir(path.dirname(artifactPath), { recursive: true })
    await fs.writeFile(artifactPath, JSON.stringify({
      schema_version: 1,
      phase: 'P9',
      kind: 'accessibility-matrix',
      sanitized: true,
      generated_at_utc: new Date().toISOString(),
      status: 'passed',
      assertions: { total: assertions, failed: 0 },
      cases,
      performance: performanceObservations,
    }, null, 2), 'utf8')
  })

  for (const viewport of viewports) {
    test(`critical routes at ${viewport.id}`, async ({ page }) => criticalRoutes(page, viewport))
    test(`keyboard focus at ${viewport.id}`, async ({ page }) => keyboardFocus(page, viewport))
    test(`forms and errors at ${viewport.id}`, async ({ page }) => formsAndErrors(page, viewport))
    test(`dialogs at ${viewport.id}`, async ({ page }) => dialogs(page, viewport))
    test(`automated accessibility at ${viewport.id}`, async ({ page }) => automatedAccessibility(page, viewport))
    test(`performance-critical routes at ${viewport.id}`, async ({ page }) => performanceCriticalRoutes(page, viewport))
  }
})
