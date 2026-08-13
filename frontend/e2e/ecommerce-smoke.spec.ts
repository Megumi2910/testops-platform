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

  test('cart removal confirmation is keyboard safe and non-destructive when cancelled', async ({ page }) => {
    await page.goto(`${ecommerceOrigin}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(ecommerceEmail)
    await page.getByLabel('Mật khẩu').fill(ecommercePassword)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page).toHaveURL(`${ecommerceOrigin}/`)

    await page.goto(`${ecommerceOrigin}/cart`, { waitUntil: 'networkidle' })
    const removeButton = page.getByRole('button', { name: 'Xóa', exact: true }).last()
    await expect(removeButton).toBeVisible()

    await removeButton.click()
    const dialog = page.getByRole('dialog', { name: 'Xóa sản phẩm khỏi giỏ hàng?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Hủy' })).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Xóa sản phẩm' })).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(removeButton).toBeFocused()

    await removeButton.click()
    await dialog.getByRole('button', { name: 'Hủy' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(removeButton).toBeFocused()
  })

  test('customer profile feedback and password controls are accessible', async ({ page }) => {
    await page.goto(`${ecommerceOrigin}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(ecommerceEmail)
    await page.getByLabel('Mật khẩu').fill(ecommercePassword)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page).toHaveURL(`${ecommerceOrigin}/`)

    await page.goto(`${ecommerceOrigin}/customer/profile`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Hồ sơ của tôi' })).toBeVisible()

    await page.getByRole('button', { name: 'Chỉnh sửa' }).click()
    await expect(page.getByLabel('Họ')).toBeVisible()
    await expect(page.getByLabel('Tên')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Số điện thoại')).toBeVisible()
    await expect(page.getByLabel('Địa chỉ')).toBeVisible()

    await page.getByRole('button', { name: 'Bảo mật' }).click()
    const currentPasswordToggle = page.getByRole('button', { name: 'Hiện mật khẩu hiện tại' })
    await expect(currentPasswordToggle).toBeVisible()
    await currentPasswordToggle.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Ẩn mật khẩu hiện tại' })).toBeFocused()
  })

  test('wishlist empty state provides an actionable catalog link', async ({ page }) => {
    await page.goto(`${ecommerceOrigin}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(ecommerceEmail)
    await page.getByLabel('Mật khẩu').fill(ecommercePassword)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page).toHaveURL(`${ecommerceOrigin}/`)

    await page.goto(`${ecommerceOrigin}/customer/wishlist`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Sản phẩm yêu thích', exact: true })).toBeVisible()
    await expect(page.getByText('Chưa có sản phẩm yêu thích')).toBeVisible()
    await page.getByRole('button', { name: 'Khám phá sản phẩm' }).click()
    await expect(page).toHaveURL(`${ecommerceOrigin}/`)
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

  test('public catalog opens a seeded category and product detail', async ({ page }) => {
    await page.goto(`${ecommerceOrigin}/categories`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Danh mục sản phẩm', exact: true })).toBeVisible()
    const category = page.getByRole('link', { name: 'Mở danh mục Thời trang' })
    await expect(category).toBeVisible()
    await category.click()
    await expect(page).toHaveURL(/\/category\/\d+$/)
    await expect(page.getByRole('heading', { name: 'Thời trang', exact: true })).toBeVisible()
    await expect(page.getByText(/Tìm thấy \d+ sản phẩm/)).toBeVisible()

    await page.goto(`${ecommerceOrigin}/search?q=Áo%20thun`, { waitUntil: 'networkidle' })
    const product = page.getByRole('link', { name: 'Xem sản phẩm Áo thun basic cotton' }).first()
    await expect(product).toBeVisible()
    await product.click()
    await expect(page).toHaveURL(/\/product\/\d+$/)
    await expect(page.getByRole('heading', { name: 'Áo thun basic cotton', exact: true })).toBeVisible()
  })

  test('header navigation exposes named controls and working category links', async ({ page }) => {
    await page.goto(`${ecommerceOrigin}/`, { waitUntil: 'networkidle' })

    await expect(page.getByRole('textbox', { name: 'Tìm kiếm sản phẩm' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tìm kiếm' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Đăng nhập' })).toBeVisible()

    const categoriesToggle = page.getByRole('button', { name: 'Danh mục' })
    await expect(categoriesToggle).toHaveAttribute('aria-expanded', 'false')
    await categoriesToggle.click()
    await expect(categoriesToggle).toHaveAttribute('aria-expanded', 'true')

    await page.getByRole('menuitem', { name: 'Áo thun' }).click()
    await expect(page).toHaveURL(/\/search\?q=%C3%81o%20thun$/)
  })

  test('search shows a stable no-result state for an unknown term', async ({ page }) => {
    await page.goto(`${ecommerceOrigin}/search?q=phase5-no-such-product-${Date.now()}`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Không tìm thấy sản phẩm', exact: true })).toBeVisible()
    await expect(page.getByText('Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm')).toBeVisible()
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

  test('search pagination follows the page URL and server response', async ({ page }) => {
    const requestedPages: number[] = []
    const image = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E'
    await page.route('**/api/products/search**', async (route) => {
      const requestUrl = new URL(route.request().url())
      const pageNumber = Number(requestUrl.searchParams.get('page') ?? '0')
      requestedPages.push(pageNumber)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{
            id: pageNumber + 1,
            name: `Pagination product ${pageNumber + 1}`,
            price: 100000,
            originalPrice: 120000,
            images: [image],
            averageRating: 4,
            reviews: [],
            sellerName: 'Mock Local Store',
          }],
          pageNumber,
          pageSize: 12,
          totalElements: 13,
          totalPages: 2,
        }),
      })
    })

    await page.goto(`${ecommerceOrigin}/search?q=shirt`, { waitUntil: 'networkidle' })
    const pagination = page.getByRole('navigation', { name: 'Phân trang tìm kiếm' })
    await expect(pagination).toContainText('Trang 1 / 2')
    await expect(pagination.getByRole('button', { name: 'Trang trước' })).toBeDisabled()

    await pagination.getByRole('button', { name: 'Trang tiếp theo' }).click()
    await expect(page).toHaveURL(/page=1/)
    await expect(pagination).toContainText('Trang 2 / 2')
    await expect(pagination.getByRole('button', { name: 'Trang tiếp theo' })).toBeDisabled()
    await expect(page.getByText('Pagination product 2')).toBeVisible()
    await expect.poll(() => requestedPages.length).toBe(2)
    expect(requestedPages).toEqual([0, 1])
  })

  test('checkout ignores duplicate clicks and sends one idempotent request', async ({ page }) => {
    const checkoutRequests: Array<{ idempotencyKey: string | undefined; body: string }> = []
    let releaseCheckout: (() => void) | undefined
    const checkoutHeld = new Promise<void>((resolve) => {
      releaseCheckout = resolve
    })

    await page.route('**/api/orders/checkout', async (route) => {
      checkoutRequests.push({
        idempotencyKey: route.request().headers()['idempotency-key'],
        body: route.request().postData() ?? '',
      })
      await checkoutHeld
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Synthetic checkout outage' }),
      })
    })

    await page.goto(`${ecommerceOrigin}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(ecommerceEmail)
    await page.getByLabel('Mật khẩu').fill(ecommercePassword)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page).toHaveURL(`${ecommerceOrigin}/`)

    await page.goto(`${ecommerceOrigin}/cart`, { waitUntil: 'networkidle' })
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: /Mua hàng/ }).click()
    await expect(page).toHaveURL(`${ecommerceOrigin}/checkout`)
    await expect(page.getByRole('heading', { name: 'Thông tin thanh toán' })).toBeVisible()

    await page.locator('textarea[name="shippingAddress"]').fill('123 Đường ABC, Quận 1, TP. Hồ Chí Minh')
    await page.locator('input[name="phoneNumber"]').fill('0912345678')
    const placeOrder = page.getByRole('button', { name: 'Đặt hàng' })
    await placeOrder.click()
    await expect(placeOrder).toBeDisabled()
    await expect(placeOrder).toHaveAttribute('aria-busy', 'true')

    // Dispatch a second click while the first request is held. The component's
    // synchronous ref guard must reject it even before React re-renders.
    await placeOrder.dispatchEvent('click')
    await expect.poll(() => checkoutRequests.length).toBe(1)
    expect(checkoutRequests[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i)
    expect(JSON.parse(checkoutRequests[0].body)).toMatchObject({
      paymentMethod: 'COD',
      selectedCartItemIds: expect.any(Array),
    })

    releaseCheckout?.()
    await expect(page.getByRole('alert')).toContainText('Synthetic checkout outage')
    await expect(placeOrder).toBeEnabled()
    await expect(placeOrder).toHaveAttribute('aria-busy', 'false')
  })
})
