import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { defaultE2ePassword, registerAndVerify, registerPending, signIn } from './helpers/auth'

const artifactPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../artifacts/browser-evidence/inputs/account-shell-result.json',
)
const viewports = [
  { id: '1440x900', width: 1440, height: 900, drawer: false },
  { id: '768x1024', width: 768, height: 1024, drawer: true },
  { id: '320x800', width: 320, height: 800, drawer: true },
] as const
const shellCaseIds = [
  'account-shell-guest',
  'account-shell-unverified',
  'account-shell-verified',
  'account-shell-administrator',
  'account-shell-keyboard-navigation',
  'account-shell-dismissal-and-sign-out',
] as const

type Viewport = (typeof viewports)[number]
type ShellCaseId = (typeof shellCaseIds)[number]
type CaseObservation = {
  id: ShellCaseId
  viewport: Viewport['id']
  status: 'passed'
  assertions_total: number
  assertions_failed: 0
}

const completedCases = new Map<string, CaseObservation>()
let unverifiedEmail = ''
let verifiedEmail = ''
let verifiedDisplayName = ''
let administratorEmail = ''
let administratorPassword = ''

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for the account-shell administrator matrix.`)
  return value
}

function beginCase(id: ShellCaseId, viewport: Viewport): CaseObservation {
  return { id, viewport: viewport.id, status: 'passed', assertions_total: 0, assertions_failed: 0 }
}

async function check(observation: CaseObservation, assertion: () => Promise<unknown> | unknown) {
  await assertion()
  observation.assertions_total += 1
}

function finishCase(observation: CaseObservation) {
  if (observation.assertions_total < 1) throw new Error(`${observation.id}|${observation.viewport} has no assertions.`)
  const key = `${observation.id}|${observation.viewport}`
  if (completedCases.has(key)) throw new Error(`Duplicate account-shell evidence case ${key}.`)
  completedCases.set(key, observation)
}

async function openNavigation(page: Page, viewport: Viewport, observation: CaseObservation) {
  const trigger = page.getByRole('button', { name: 'Open navigation' })
  if (!viewport.drawer) {
    await check(observation, () => expect(trigger).toBeHidden())
    return page.getByRole('navigation', { name: 'Primary navigation' })
  }

  await check(observation, () => expect(trigger).toBeVisible())
  await trigger.click()
  const drawer = page.getByRole('dialog', { name: 'Site navigation' })
  await check(observation, () => expect(drawer).toBeVisible())
  return drawer.getByRole('navigation', { name: 'Primary navigation' })
}

async function resetAndSignIn(page: Page, email: string, password = defaultE2ePassword) {
  await page.context().clearCookies()
  await signIn(page, email, password)
}

async function assertGuestMatrix(page: Page, viewport: Viewport) {
  const observation = beginCase('account-shell-guest', viewport)
  await page.goto('/')
  const navigation = await openNavigation(page, viewport, observation)
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible())
  await check(observation, () => expect(navigation.locator('.account-menu-trigger')).toHaveCount(0))
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0))
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0))
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0))
  await check(observation, () => expect(page.locator('.verification-banner')).toHaveCount(0))
  if (viewport.drawer) {
    await check(observation, async () => {
      const containment = await page.locator('.nav-drawer.open').evaluate(element => {
        const style = window.getComputedStyle(element)
        const bounds = element.getBoundingClientRect()
        return {
          bottom: Math.round(bounds.bottom),
          height: Math.round(bounds.height),
          overflowY: style.overflowY,
          overscrollBehavior: style.overscrollBehavior,
          viewportHeight: window.innerHeight,
        }
      })
      expect(containment.height).toBeLessThanOrEqual(containment.viewportHeight)
      expect(containment.bottom).toBeLessThanOrEqual(containment.viewportHeight)
      expect(containment.overflowY).toBe('auto')
      expect(containment.overscrollBehavior).toBe('contain')
    })
  }
  finishCase(observation)
}

async function assertUnverifiedMatrix(page: Page, viewport: Viewport) {
  const observation = beginCase('account-shell-unverified', viewport)
  await resetAndSignIn(page, unverifiedEmail)
  const navigation = await openNavigation(page, viewport, observation)
  await check(observation, () => expect(page.locator('.verification-banner')).toContainText('Your email is not verified.'))
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0))
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0))
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0))
  const accountTrigger = navigation.locator('.account-menu-trigger')
  await check(observation, () => expect(accountTrigger).toBeVisible())
  await accountTrigger.click()
  await check(observation, () => expect(navigation.getByRole('menuitem', { name: 'Verify email' })).toBeVisible())
  await check(observation, () => expect(navigation.getByRole('menuitem', { name: 'Administration' })).toHaveCount(0))
  finishCase(observation)
}

async function assertVerifiedMatrix(page: Page, viewport: Viewport) {
  const observation = beginCase('account-shell-verified', viewport)
  await resetAndSignIn(page, verifiedEmail)
  const navigation = await openNavigation(page, viewport, observation)
  await check(observation, () => expect(page.locator('.verification-banner')).toHaveCount(0))
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Projects', exact: true })).toBeVisible())
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible())
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0))
  const accountTrigger = navigation.locator('.account-menu-trigger')
  await check(observation, () => expect(accountTrigger).toHaveAccessibleName(`Open account menu for ${verifiedDisplayName}`))
  await check(observation, async () => {
    const truncation = await accountTrigger.locator('.nav-account-name').evaluate(element => {
      const style = window.getComputedStyle(element)
      return {
        clientWidth: element.clientWidth,
        display: style.display,
        scrollWidth: element.scrollWidth,
        textOverflow: style.textOverflow,
      }
    })
    expect(truncation.display).toBe('block')
    expect(truncation.textOverflow).toBe('ellipsis')
    expect(truncation.scrollWidth).toBeGreaterThan(truncation.clientWidth)
  })
  await accountTrigger.click()
  await check(observation, () => expect(navigation.getByRole('menuitem', { name: 'Account security' })).toBeVisible())
  await check(observation, () => expect(navigation.getByRole('menuitem', { name: 'Active sessions' })).toBeVisible())
  await check(observation, () => expect(navigation.getByRole('menuitem', { name: 'Verify email' })).toHaveCount(0))
  await check(observation, () => expect(navigation.getByRole('menuitem', { name: 'Administration' })).toHaveCount(0))
  finishCase(observation)
}

async function assertAdministratorMatrix(page: Page, viewport: Viewport) {
  const observation = beginCase('account-shell-administrator', viewport)
  await resetAndSignIn(page, administratorEmail, administratorPassword)
  const navigation = await openNavigation(page, viewport, observation)
  await check(observation, () => expect(page.locator('.verification-banner')).toHaveCount(0))
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Projects', exact: true })).toBeVisible())
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible())
  await check(observation, () => expect(navigation.getByRole('link', { name: 'Admin', exact: true })).toBeVisible())
  const accountTrigger = navigation.locator('.account-menu-trigger')
  await check(observation, () => expect(accountTrigger).toBeVisible())
  await accountTrigger.click()
  await check(observation, () => expect(navigation.getByRole('menuitem', { name: 'Administration' })).toBeVisible())
  await check(observation, () => expect(navigation.getByRole('menuitem', { name: 'Verify email' })).toHaveCount(0))
  finishCase(observation)
}

async function assertFocused(observation: CaseObservation, locator: Locator) {
  // Playwright's role matcher can report an otherwise focused menuitem as
  // inactive while the parent role=menu is mounted. Compare the resolved DOM
  // node with document.activeElement so the assertion remains exact.
  await check(observation, async () => {
    await expect.poll(() => locator.evaluate(element => element === document.activeElement)).toBe(true)
  })
}

async function assertKeyboardMatrix(page: Page, viewport: Viewport) {
  const observation = beginCase('account-shell-keyboard-navigation', viewport)
  await resetAndSignIn(page, verifiedEmail)
  const navigation = await openNavigation(page, viewport, observation)
  const accountTrigger = navigation.locator('.account-menu-trigger')

  await accountTrigger.focus()
  await accountTrigger.press('Enter')
  const firstMenuItem = navigation.getByRole('menuitem', { name: 'Account security' })
  const lastMenuItem = navigation.getByRole('menuitem', { name: 'Sign out' })
  await assertFocused(observation, firstMenuItem)
  await page.keyboard.press('Escape')
  await check(observation, () => expect(navigation.getByRole('menu')).toHaveCount(0))
  await assertFocused(observation, accountTrigger)

  await accountTrigger.press('Space')
  await check(observation, () => expect(navigation.getByRole('menu')).toBeVisible())
  await page.keyboard.press('Escape')
  await assertFocused(observation, accountTrigger)
  await accountTrigger.press('ArrowDown')
  await assertFocused(observation, firstMenuItem)
  await page.keyboard.press('End')
  await assertFocused(observation, lastMenuItem)
  await page.keyboard.press('ArrowDown')
  await assertFocused(observation, firstMenuItem)
  await page.keyboard.press('ArrowUp')
  await assertFocused(observation, lastMenuItem)
  await page.keyboard.press('Home')
  await assertFocused(observation, firstMenuItem)
  await page.keyboard.press('Shift+Tab')
  await assertFocused(observation, lastMenuItem)
  await page.keyboard.press('Tab')
  await assertFocused(observation, firstMenuItem)
  await page.keyboard.press('Escape')
  await assertFocused(observation, accountTrigger)

  if (viewport.drawer) {
    const drawer = page.getByRole('dialog', { name: 'Site navigation' })
    await check(observation, () => expect(drawer).toBeVisible())
    const focusables = drawer.locator('a[href], button:not([disabled])')
    const firstDrawerItem = focusables.first()
    const lastDrawerItem = focusables.last()
    await firstDrawerItem.focus()
    await page.keyboard.press('Shift+Tab')
    await assertFocused(observation, lastDrawerItem)
    await page.keyboard.press('Tab')
    await assertFocused(observation, firstDrawerItem)

    await accountTrigger.focus()
    await accountTrigger.press('Enter')
    await page.keyboard.press('Escape')
    await check(observation, () => expect(navigation.getByRole('menu')).toHaveCount(0))
    await check(observation, () => expect(drawer).toBeVisible())
    await page.keyboard.press('Escape')
    await check(observation, () => expect(drawer).toHaveCount(0))
    await assertFocused(observation, page.getByRole('button', { name: 'Open navigation' }))
    await check(observation, async () => expect(await page.locator('body').evaluate(element => element.style.overflow)).toBe(''))
  }
  finishCase(observation)
}

async function assertDismissalAndSignOut(page: Page, viewport: Viewport) {
  const observation = beginCase('account-shell-dismissal-and-sign-out', viewport)
  await resetAndSignIn(page, verifiedEmail)
  let navigation = await openNavigation(page, viewport, observation)
  let accountTrigger = navigation.locator('.account-menu-trigger')
  await accountTrigger.click()
  await page.locator('.nav-drawer').dispatchEvent('pointerdown')
  await check(observation, () => expect(navigation.getByRole('menu')).toHaveCount(0))
  if (viewport.drawer) await check(observation, () => expect(page.getByRole('dialog', { name: 'Site navigation' })).toBeVisible())

  await accountTrigger.click()
  await page.evaluate(() => {
    window.history.pushState({}, '', '/#shell-dismissal')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await check(observation, () => expect(page).toHaveURL(/\/#shell-dismissal$/))
  await check(observation, () => expect(page.getByRole('menu')).toHaveCount(0))
  if (viewport.drawer) await check(observation, () => expect(page.getByRole('dialog', { name: 'Site navigation' })).toHaveCount(0))

  await page.goto('/')
  navigation = await openNavigation(page, viewport, observation)
  accountTrigger = navigation.locator('.account-menu-trigger')
  await accountTrigger.click()
  await navigation.getByRole('menuitem', { name: 'Account security' }).click()
  await check(observation, () => expect(page).toHaveURL(/\/account#security$/))
  await check(observation, () => expect(page.getByRole('menu')).toHaveCount(0))
  if (viewport.drawer) await check(observation, () => expect(page.getByRole('dialog', { name: 'Site navigation' })).toHaveCount(0))

  await page.goto('/')
  if (viewport.drawer) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    // At 320px the drawer occupies most of the viewport; click the known
    // exposed left edge so the drawer itself cannot intercept the backdrop.
    await page.locator('.nav-drawer-backdrop').click({ position: { x: 2, y: Math.floor(viewport.height / 2) } })
    await check(observation, () => expect(page.getByRole('dialog', { name: 'Site navigation' })).toHaveCount(0))
    await assertFocused(observation, page.getByRole('button', { name: 'Open navigation' }))
  } else {
    await check(observation, () => expect(page.locator('.nav-drawer-backdrop')).toBeHidden())
  }

  navigation = await openNavigation(page, viewport, observation)
  await navigation.locator('.account-menu-trigger').click()
  await navigation.getByRole('menuitem', { name: 'Sign out' }).click()
  await check(observation, () => expect(page).toHaveURL(/\/login(?:[?#].*)?$/))
  await check(observation, () => expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible())
  await check(observation, () => expect(page.locator('.account-menu-trigger')).toHaveCount(0))
  finishCase(observation)
}

test.describe.serial('account shell role, viewport, keyboard, and dismissal matrix', () => {
  test.beforeAll(async ({ browser }) => {
    await fs.rm(artifactPath, { force: true })
    completedCases.clear()
    const runId = randomUUID().replaceAll('-', '').slice(0, 16)
    unverifiedEmail = `p6-shell-unverified-${runId}@example.test`
    verifiedEmail = `p6-shell-verified-${runId}@example.test`
    verifiedDisplayName = `Verified shell ${runId} with a deliberately long display name for truncation proof`
    administratorEmail = requiredEnvironment('E2E_ADMIN_EMAIL')
    administratorPassword = requiredEnvironment('E2E_ADMIN_PASSWORD')

    const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
    const unverifiedContext = await browser.newContext({ baseURL })
    try {
      await registerPending(await unverifiedContext.newPage(), unverifiedEmail, { displayName: `Unverified shell ${runId}` })
    } finally {
      await unverifiedContext.close()
    }
    const verifiedContext = await browser.newContext({ baseURL })
    try {
      await registerAndVerify(await verifiedContext.newPage(), verifiedEmail, { displayName: verifiedDisplayName })
    } finally {
      await verifiedContext.close()
    }
  })

  test.afterAll(async () => {
    const expectedCaseCount = shellCaseIds.length * viewports.length
    if (completedCases.size !== expectedCaseCount) {
      await fs.rm(artifactPath, { force: true })
      return
    }
    const cases = Array.from(completedCases.values())
    const assertionTotal = cases.reduce((total, shellCase) => total + shellCase.assertions_total, 0)
    await fs.mkdir(path.dirname(artifactPath), { recursive: true })
    await fs.writeFile(artifactPath, JSON.stringify({
      schema_version: 1,
      phase: 'P6',
      kind: 'account-shell',
      sanitized: true,
      generated_at_utc: new Date().toISOString(),
      status: 'passed',
      assertions: { total: assertionTotal, failed: 0 },
      cases,
    }, null, 2), 'utf8')
  })

  for (const viewport of viewports) {
    test(`role and status boundaries at ${viewport.id}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await assertGuestMatrix(page, viewport)
      await assertUnverifiedMatrix(page, viewport)
      await assertVerifiedMatrix(page, viewport)
      await assertAdministratorMatrix(page, viewport)
    })

    test(`keyboard navigation at ${viewport.id}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await assertKeyboardMatrix(page, viewport)
    })

    test(`dismissal and sign-out at ${viewport.id}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await assertDismissalAndSignOut(page, viewport)
    })
  }
})
