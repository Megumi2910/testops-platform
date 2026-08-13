import { expect, test, type Page } from '@playwright/test'

const ecommerceBaseUrl = process.env.ECOMMERCE_E2E_BASE_URL
const ecommerceOrigin = ecommerceBaseUrl?.replace(/\/$/, '')
const checkoutEnabled = process.env.ECOMMERCE_E2E_CHECKOUT === 'true'
const customerAEmail = process.env.ECOMMERCE_E2E_CUSTOMER_EMAIL ?? 'mock.customer@example.test'
const customerAPassword = process.env.ECOMMERCE_E2E_CUSTOMER_PASSWORD ?? 'MockCustomer!123'
const customerBEmail = process.env.ECOMMERCE_E2E_CUSTOMER_B_EMAIL ?? 'mock.customer-b@example.test'
const customerBPassword = process.env.ECOMMERCE_E2E_CUSTOMER_B_PASSWORD ?? 'MockCustomerB!123'

type JsonRecord = Record<string, unknown>
type ApiResult = { status: number; body: JsonRecord | null }

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function data(result: ApiResult): JsonRecord | null {
  const value = result.body?.['data']
  return isRecord(value) ? value : null
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${ecommerceOrigin}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mật khẩu').fill(password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(`${ecommerceOrigin}/`)
}

async function browserApi(page: Page, path: string, init?: {
  method?: string
  body?: unknown
  idempotencyKey?: string
}): Promise<ApiResult> {
  return page.evaluate(async ({ path: requestPath, init: requestInit }) => {
    const token = window.localStorage.getItem('token')
    const response = await fetch(requestPath, {
      credentials: 'include',
      method: requestInit?.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(requestInit?.idempotencyKey ? { 'Idempotency-Key': requestInit.idempotencyKey } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: requestInit?.body === undefined ? undefined : JSON.stringify(requestInit.body),
    })
    let body: JsonRecord | null = null
    try {
      body = await response.json() as JsonRecord
    } catch {
      // Empty responses are valid for some cleanup operations.
    }
    return { status: response.status, body }
  }, { path, init })
}

test.describe('ecommerce Phase 5 payment and stale-stock recovery', () => {
  test.skip(!ecommerceOrigin || !checkoutEnabled, 'Set ECOMMERCE_E2E_BASE_URL and ECOMMERCE_E2E_CHECKOUT=true after resetting the isolated E2E stack.')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  test('uses backend QR configuration and exposes the pending payment state', async ({ page }) => {
    await signIn(page, customerAEmail, customerAPassword)

    const config = await browserApi(page, '/api/payment/config')
    expect(config.status).toBe(200)
    expect(data(config)).toMatchObject({
      qrEnabled: true,
      qrBankCode: expect.any(String),
      qrAccountNumber: expect.any(String),
      qrImageBaseUrl: expect.stringMatching(/^https?:\/\//),
    })

    const products = await browserApi(page, '/api/products?size=100')
    const rows = Array.isArray(products.body?.['data'])
      ? products.body?.['data'].filter(isRecord)
      : []
    const product = rows.find((entry) => entry['sku'] === 'MOCK-CONCURRENCY-001')
    expect(product?.['id']).toBeTruthy()
    expect(product?.['stock']).toBeGreaterThan(0)

    const order = await browserApi(page, '/api/orders/checkout', {
      method: 'POST',
      idempotencyKey: crypto.randomUUID(),
      body: {
        isBuyNow: true,
        productId: product?.['id'],
        quantity: 1,
        shippingAddress: '1 QA Payment Street',
        phoneNumber: '0912345678',
        paymentMethod: 'QR',
        notes: 'Phase 5 payment-state cleanup',
      },
    })
    expect(order.status).toBe(200)
    expect(data(order)?.['payment']).toMatchObject({ paymentMethod: 'QR', paymentStatus: 'PENDING' })

    const orderId = data(order)?.['id']
    expect(orderId).toBeTruthy()
    const cancelled = await browserApi(page, `/api/orders/${orderId}/cancel`, {
      method: 'PUT',
      body: { cancellationReason: 'Phase 5 payment-state cleanup' },
    })
    expect(cancelled.status).toBe(200)
  })

  test('shows a structured stale-stock diff before submitting checkout', async ({ browser }) => {
    const customerAContext = await browser.newContext()
    const customerBContext = await browser.newContext()
    const customerA = await customerAContext.newPage()
    const customerB = await customerBContext.newPage()
    let competingOrderId: unknown
    let cartItemId: unknown

    try {
      await signIn(customerA, customerAEmail, customerAPassword)
      await signIn(customerB, customerBEmail, customerBPassword)

      const products = await browserApi(customerA, '/api/products?size=100')
      const rows = Array.isArray(products.body?.['data'])
        ? products.body?.['data'].filter(isRecord)
        : []
      const product = rows.find((entry) => entry['sku'] === 'MOCK-CONCURRENCY-001')
      expect(product?.['id']).toBeTruthy()
      expect(product?.['stock']).toBeGreaterThan(0)

      const added = await browserApi(customerA, `/api/cart/items?productId=${product?.['id']}&quantity=1`, { method: 'POST' })
      expect(added.status).toBe(200)
      const cart = await browserApi(customerA, '/api/cart')
      const items = isRecord(data(cart)) && Array.isArray(data(cart)?.['items'])
        ? (data(cart)?.['items'] as unknown[]).filter(isRecord)
        : []
      const item = items.find((entry) => entry['productId'] === product?.['id'])
      cartItemId = item?.['id']
      expect(cartItemId).toBeTruthy()

      await customerA.goto(`${ecommerceOrigin}/cart`, { waitUntil: 'networkidle' })
      await customerA.locator('input[type="checkbox"]').last().check()
      await customerA.getByRole('button', { name: /Mua hàng/ }).click()
      await expect(customerA).toHaveURL(`${ecommerceOrigin}/checkout`)

      const competing = await browserApi(customerB, '/api/orders/checkout', {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        body: {
          isBuyNow: true,
          productId: product?.['id'],
          quantity: 1,
          shippingAddress: '2 QA Payment Street',
          phoneNumber: '0912345678',
          paymentMethod: 'COD',
          notes: 'Phase 5 stale-stock setup',
        },
      })
      expect(competing.status).toBe(200)
      competingOrderId = data(competing)?.['id']
      expect(competingOrderId).toBeTruthy()

      const staleCart = await browserApi(customerA, '/api/cart')
      expect(staleCart.status).toBe(200)

      await customerA.getByLabel('Địa chỉ').fill('1 QA Checkout Street')
      await customerA.getByLabel('Số điện thoại').fill('0912345678')
      await customerA.getByRole('button', { name: 'Đặt hàng' }).click({ timeout: 10_000 })
      await customerA.waitForTimeout(2_000)
      await expect(customerA.getByTestId('stale-cart-summary')).toBeVisible({ timeout: 2_000 })
      await expect(customerA.getByTestId('stale-cart-summary')).toContainText('Sản phẩm kiểm thử tồn kho', { timeout: 2_000 })
      await expect(customerA.getByRole('button', { name: 'Mở giỏ hàng' })).toBeVisible({ timeout: 2_000 })
    } finally {
      if (competingOrderId) {
        await Promise.race([
          browserApi(customerB, `/api/orders/${competingOrderId}/cancel`, {
            method: 'PUT',
            body: { cancellationReason: 'Phase 5 stale-stock cleanup' },
          }),
          new Promise((resolve) => setTimeout(resolve, 5_000)),
        ])
      }
      if (cartItemId) {
        await browserApi(customerA, `/api/cart/items/${cartItemId}`, { method: 'DELETE' })
      }
      await customerAContext.close()
      await customerBContext.close()
    }
  })

})
