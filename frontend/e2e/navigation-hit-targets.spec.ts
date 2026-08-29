import { expect, test, type Page } from '@playwright/test'

import { signIn } from './helpers/auth'

const viewports = [
  { id: '320', width: 320, height: 800, drawer: true },
  { id: '390', width: 390, height: 844, drawer: true },
  { id: '800', width: 800, height: 900, drawer: true },
  { id: '801', width: 801, height: 900, drawer: false },
] as const

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for the navigation hit-target regression.`)
  return value
}

async function clickCentre(page: Page, selector: string) {
  const target = page.locator(selector)
  await expect(target).toBeVisible()
  await expect(target).toHaveCSS('pointer-events', 'none')
  const box = await target.boundingBox()
  if (!box) throw new Error(`${selector} must have visible bounds.`)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

test('native navigation controls own glyph and account-label activation at responsive boundaries', async ({ page }) => {
  const administratorEmail = requiredEnvironment('E2E_ADMIN_EMAIL')
  const administratorPassword = requiredEnvironment('E2E_ADMIN_PASSWORD')

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.context().clearCookies()
    await signIn(page, administratorEmail, administratorPassword)

    const hamburger = page.getByRole('button', { name: 'Open navigation' })
    if (viewport.drawer) {
      await expect(hamburger).toBeVisible()
      await expect(hamburger).toHaveAttribute('aria-controls', 'site-navigation')
      await clickCentre(page, '.nav-menu > svg')
      await expect(page.getByRole('dialog', { name: 'Site navigation' })).toBeVisible()
    } else {
      await expect(hamburger).toBeHidden()
    }

    const scope = viewport.drawer ? page.getByRole('dialog', { name: 'Site navigation' }) : page
    const accountTrigger = scope.locator('.account-menu-trigger')
    if (!viewport.drawer) {
      const box = await accountTrigger.boundingBox()
      if (!box || box.x < 0 || box.x + box.width > viewport.width) {
        throw new Error(`The desktop account trigger must remain inside the ${viewport.id}px viewport.`)
      }
    }
    for (const selector of ['.account-menu-avatar', '.nav-account-name', '.account-menu-disclosure']) {
      await clickCentre(page, `${viewport.drawer ? '#site-navigation ' : ''}.account-menu-trigger ${selector}`)
      await expect(scope.getByRole('menu')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(scope.getByRole('menu')).toHaveCount(0)
    }

    if (viewport.drawer) {
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'Site navigation' })).toHaveCount(0)
      await expect(hamburger).toBeFocused()
    } else {
      await expect(accountTrigger).toBeVisible()
    }
  }
})
