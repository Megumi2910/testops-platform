import { expect, type Page } from '@playwright/test'

export async function assertBasicAccessibility(page: Page) {
  const violations = await page.evaluate(() => {
    const duplicateIds = [...document.querySelectorAll<HTMLElement>('[id]')]
      .map(element => element.id)
      .filter((id, index, ids) => id && ids.indexOf(id) !== index)
    const unlabeledFields = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type="hidden"]), select, textarea')]
      .filter(element => !element.labels?.length && !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby') && !element.title)
      .map(element => element.outerHTML)
    const unnamedActions = [...document.querySelectorAll<HTMLElement>('button, a[href]')]
      .filter(element => !element.innerText.trim() && !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby') && !element.title)
      .map(element => element.outerHTML)
    const imagesWithoutAlt = [...document.querySelectorAll<HTMLImageElement>('img:not([alt])')]
      .map(element => element.outerHTML)
    return { duplicateIds, unlabeledFields, unnamedActions, imagesWithoutAlt, mainCount: document.querySelectorAll('main').length }
  })

  expect(violations, JSON.stringify(violations, null, 2)).toEqual({
    duplicateIds: [],
    unlabeledFields: [],
    unnamedActions: [],
    imagesWithoutAlt: [],
    mainCount: 1,
  })
}

export async function assertNoHorizontalOverflowAt320px(page: Page) {
  const original = page.viewportSize()
  await page.setViewportSize({ width: 320, height: 800 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (original) await page.setViewportSize(original)
}
