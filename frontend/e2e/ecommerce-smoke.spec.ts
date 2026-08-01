import { expect, test } from '@playwright/test'

const ecommerceBaseUrl = process.env.ECOMMERCE_BASE_URL
const ecommerceOrigin = ecommerceBaseUrl?.replace(/\/$/, '')
const ecommerceEmail = process.env.ECOMMERCE_SMOKE_EMAIL ?? 'mock.customer@example.test'
const ecommercePassword = process.env.ECOMMERCE_SMOKE_PASSWORD ?? 'MockCustomer!123'

test.describe('ecommerce storefront smoke', () => {
  test.skip(!ecommerceBaseUrl, 'Set ECOMMERCE_BASE_URL to run the opt-in ecommerce smoke suite.')

  test('verified customer can open a seeded cart and reach checkout', async ({ page }) => {
    const consoleErrors: string[] = []
    const failedRequests: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? 'unknown failure'
      // React route changes can abort requests that are no longer needed. Keep
      // those visible in diagnostics while failing only on real transport errors.
      if (!failure.includes('ERR_ABORTED')) failedRequests.push(`${request.url()} (${failure})`)
    })

    await page.goto(`${ecommerceOrigin}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(ecommerceEmail)
    await page.getByLabel('Mật khẩu').fill(ecommercePassword)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page).toHaveURL(`${ecommerceOrigin}/`)

    await page.goto(`${ecommerceOrigin}/cart`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Giỏ hàng của tôi' })).toBeVisible()
    await expect(page.getByText(/sản phẩm trong giỏ hàng/)).toBeVisible()

    const selectAll = page.locator('input[type="checkbox"]').first()
    await expect(selectAll).toBeVisible()
    await selectAll.check()
    await page.getByRole('button', { name: /Mua hàng/ }).click()
    await expect(page).toHaveURL(`${ecommerceOrigin}/checkout`)
    await expect(page.getByRole('heading', { name: 'Thông tin thanh toán' })).toBeVisible()
    await expect(page.getByText('Phương thức thanh toán')).toBeVisible()

    expect(consoleErrors).toEqual([])
    expect(failedRequests).toEqual([])
    expect(page.url()).not.toContain('localhost:8080')
  })

  test('storefront keeps the mobile layout within the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${ecommerceOrigin}/`, { waitUntil: 'networkidle' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })

  test('search state is shareable and filters are keyboard-operable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${ecommerceOrigin}/search?q=shirt`, { waitUntil: 'networkidle' })
    await expect(page.locator('input[name="q"]')).toHaveValue('shirt')

    const filterToggle = page.getByRole('button', { name: /Bộ lọc/ })
    await filterToggle.focus()
    await page.keyboard.press('Enter')
    await expect(filterToggle).toHaveAttribute('aria-expanded', 'true')

    const category = page.getByLabel('Danh mục')
    await expect(category).toBeVisible()
    await category.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/category=thoi-trang/)

    const sort = page.getByLabel('Sắp xếp sản phẩm')
    await sort.focus()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/sort=rating/)
  })

  test('search exposes an actionable retry after a backend outage', async ({ page }) => {
    let shouldFail = true
    await page.route('**/api/products/**', async (route) => {
      if (shouldFail) {
        shouldFail = false
        await route.abort('failed')
        return
      }
      await route.continue()
    })

    await page.goto(`${ecommerceOrigin}/search?q=shirt`, { waitUntil: 'networkidle' })
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Lỗi khi tải dữ liệu')
    await expect(alert).toContainText('Không thể kết nối tới máy chủ')
    await expect(alert).toContainText('proxy /api')
    await page.getByRole('button', { name: 'Thử lại tải sản phẩm' }).click()
    await expect(page.getByText(/Tìm thấy|Hiển thị/)).toBeVisible()
    await expect(alert).toHaveCount(0)
  })
})
