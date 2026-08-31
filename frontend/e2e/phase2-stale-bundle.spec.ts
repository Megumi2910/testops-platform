import { expect, test } from '@playwright/test'

test('a retained tab recovers once, then shows a safe page when the route chunk stays unavailable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Browser checks you can trust.' })).toBeVisible()

  const loadedScripts = new Set(await page.evaluate(() => performance.getEntriesByType('resource')
    .map(entry => entry.name)
    .filter(name => name.endsWith('.js'))))
  let blockNewChunks = false
  await page.route('**/*', async route => {
    const request = route.request()
    if (blockNewChunks && request.resourceType() === 'script' && !loadedScripts.has(request.url())) {
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  blockNewChunks = true
  await page.goto('/password-reset')
  await expect(page.getByRole('heading', { name: 'We couldn’t load this page' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/older application bundle/)).toBeVisible()
  await expect(page.getByText(/Build revision:/)).toBeVisible()
})
