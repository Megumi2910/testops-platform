import { expect, test, type Page } from '@playwright/test'

const ecommerceBaseUrl = process.env.ECOMMERCE_E2E_BASE_URL
const ecommerceOrigin = ecommerceBaseUrl?.replace(/\/$/, '')
const rolesEnabled = process.env.ECOMMERCE_E2E_ROLES === 'true'
const customerEmail = process.env.ECOMMERCE_E2E_CUSTOMER_EMAIL ?? 'mock.customer@example.test'
const customerPassword = process.env.ECOMMERCE_E2E_CUSTOMER_PASSWORD ?? 'MockCustomer!123'
const unverifiedEmail = process.env.ECOMMERCE_E2E_UNVERIFIED_EMAIL ?? 'mock.unverified@example.test'
const unverifiedPassword = process.env.ECOMMERCE_E2E_UNVERIFIED_PASSWORD ?? 'MockUnverified!123'
const sellerEmail = process.env.ECOMMERCE_E2E_SELLER_EMAIL ?? 'mock.seller@example.test'
const sellerPassword = process.env.ECOMMERCE_E2E_SELLER_PASSWORD ?? 'MockSeller!123'
const adminEmail = process.env.ECOMMERCE_E2E_ADMIN_EMAIL ?? 'e2e.admin@example.test'
const adminPassword = process.env.ECOMMERCE_E2E_ADMIN_PASSWORD ?? 'E2eAdmin!123'

type JsonRecord = Record<string, unknown>
type ApiResult = { status: number; body: JsonRecord | null }

async function signIn(page: Page, email: string, password: string, expectedPath = '/') {
  await page.goto(`${ecommerceOrigin}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mật khẩu').fill(password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(`${ecommerceOrigin}${expectedPath}`)
}

async function browserApi(page: Page, path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult> {
  return page.evaluate(async ({ path: requestPath, init: requestInit }) => {
    const token = window.localStorage.getItem('token')
    const response = await fetch(requestPath, {
      credentials: 'include',
      method: requestInit?.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: requestInit?.body === undefined ? undefined : JSON.stringify(requestInit.body),
    })
    let body: JsonRecord | null = null
    try {
      body = await response.json() as JsonRecord
    } catch {
      // Empty error responses are valid for some security filters.
    }
    return { status: response.status, body }
  }, { path, init })
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rows(result: ApiResult): JsonRecord[] {
  const data = result.body?.data
  if (Array.isArray(data)) return data.filter(isRecord)
  if (isRecord(data) && Array.isArray(data.content)) return data.content.filter(isRecord)
  if (isRecord(data) && Array.isArray(data.items)) return data.items.filter(isRecord)
  return []
}

function denied(status: number, path = 'request') {
  expect([401, 403, 404], `${path} returned an unexpected status`).toContain(status)
}

test.describe('ecommerce Phase 5 permission matrix', () => {
  test.skip(!ecommerceOrigin || !rolesEnabled, 'Set ECOMMERCE_E2E_BASE_URL and ECOMMERCE_E2E_ROLES=true after resetting the isolated ecommerce stack.')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  test('guest and unverified users cannot use verified-only operations', async ({ browser, page }) => {
    await page.goto(`${ecommerceOrigin}/`, { waitUntil: 'networkidle' })
    const guestCart = await browserApi(page, '/api/cart')
    denied(guestCart.status)

    await signIn(page, unverifiedEmail, unverifiedPassword)
    const cart = await browserApi(page, '/api/cart')
    const count = await browserApi(page, '/api/cart/count')
    const checkout = await browserApi(page, '/api/orders/checkout', {
      method: 'POST',
      body: { selectedCartItemIds: [], paymentMethod: 'COD' },
    })
    expect(cart.status).toBeGreaterThanOrEqual(400)
    expect(count.status).toBe(200)
    expect(checkout.status).toBeGreaterThanOrEqual(400)

    const secondContext = await browser.newContext()
    try {
      const secondPage = await secondContext.newPage()
      await secondPage.goto(`${ecommerceOrigin}/customer`, { waitUntil: 'networkidle' })
      await expect(secondPage).toHaveURL(`${ecommerceOrigin}/login`)
    } finally {
      await secondContext.close()
    }
  })

  test('verified customers and sellers cannot cross role boundaries', async ({ browser }) => {
    const customerContext = await browser.newContext()
    const sellerContext = await browser.newContext()
    const customer = await customerContext.newPage()
    const seller = await sellerContext.newPage()

    try {
      await signIn(customer, customerEmail, customerPassword)
      for (const path of ['/api/admin/products', '/api/admin/users', '/api/admin/orders', '/api/seller/products', '/api/seller/orders', '/api/seller/statistics']) {
        denied((await browserApi(customer, path)).status, `customer ${path}`)
      }

      await signIn(seller, sellerEmail, sellerPassword, '/seller')
      expect((await browserApi(seller, '/api/seller/products?page=0&size=50')).status).toBe(200)
      expect((await browserApi(seller, '/api/seller/orders')).status).toBe(200)
      for (const path of ['/api/admin/products', '/api/admin/users', '/api/admin/orders', '/api/orders/all']) {
        denied((await browserApi(seller, path)).status, `seller ${path}`)
      }

      const publicProducts = await browserApi(customer, '/api/products?size=100')
      const foreign = rows(publicProducts).find((product) => product.sku === 'MOCK-SELLER-B-001')
      expect(foreign?.id).toBeTruthy()
      const attemptedEdit = await browserApi(seller, `/api/seller/products/${foreign?.id}`, {
        method: 'PUT',
        // Send a complete DTO so validation cannot mask the ownership check.
        body: { ...foreign, name: 'Unauthorized QA edit' },
      })
      expect([401, 403, 404], `seller edit foreign product: ${JSON.stringify(attemptedEdit.body)}`).toContain(attemptedEdit.status)
    } finally {
      await customerContext.close()
      await sellerContext.close()
    }
  })

  test('administrators can read administrative surfaces while preserving normal role fixtures', async ({ page }) => {
    await signIn(page, adminEmail, adminPassword, '/admin')
    for (const path of [
      '/api/admin/products?page=0&size=20',
      '/api/admin/users?page=0&size=20',
      '/api/admin/orders?page=0&size=20',
      '/api/admin/statistics/dashboard',
      '/api/admin/statistics/analytics',
      '/api/categories/all',
    ]) {
      expect((await browserApi(page, path)).status).toBe(200)
    }
  })
})
