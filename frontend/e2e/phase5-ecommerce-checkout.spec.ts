import { expect, test, type Page } from '@playwright/test'

const ecommerceBaseUrl = process.env.ECOMMERCE_E2E_BASE_URL
const ecommerceOrigin = ecommerceBaseUrl?.replace(/\/$/, '')
const checkoutEnabled = process.env.ECOMMERCE_E2E_CHECKOUT === 'true'
const customerEmail = process.env.ECOMMERCE_E2E_CUSTOMER_B_EMAIL ?? 'mock.customer-b@example.test'
const customerPassword = process.env.ECOMMERCE_E2E_CUSTOMER_B_PASSWORD ?? 'MockCustomerB!123'

type JsonRecord = Record<string, unknown>
type ApiResult = { status: number; body: JsonRecord | null }

async function signIn(page: Page) {
  await page.goto(`${ecommerceOrigin}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(customerEmail)
  await page.getByLabel('Mật khẩu').fill(customerPassword)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(`${ecommerceOrigin}/`)
}

async function browserApi(page: Page, path: string, init?: { method?: string; body?: unknown; idempotencyKey?: string }): Promise<ApiResult> {
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
      // Some error responses intentionally have no JSON body.
    }
    return { status: response.status, body }
  }, { path, init })
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function data(result: ApiResult): JsonRecord | null {
  const value = result.body?.['data']
  return isJsonRecord(value) ? value : null
}

function cartItems(result: ApiResult): JsonRecord[] {
  const value = data(result)?.['items']
  return Array.isArray(value) ? value.filter(isJsonRecord) : []
}

test.describe('ecommerce Phase 5 checkout integrity', () => {
  test.skip(!ecommerceOrigin || !checkoutEnabled, 'Set ECOMMERCE_E2E_BASE_URL and ECOMMERCE_E2E_CHECKOUT=true after resetting the isolated E2E stack.')
  test.setTimeout(60_000)

  test('purchases one selected cart item, replays idempotently, and cancels once', async ({ page }) => {
    await signIn(page)

    const initialCart = await browserApi(page, '/api/cart')
    expect(initialCart.status).toBe(200)
    const [item] = cartItems(initialCart)
    expect(item?.['id']).toBeTruthy()

    const cartItemId = item['id']
    const requestBody = {
      selectedCartItemIds: [cartItemId],
      shippingAddress: '1 QA Checkout Street',
      phoneNumber: '0912345678',
      paymentMethod: 'COD',
      notes: 'Phase 5 integrity run',
    }
    const idempotencyKey = crypto.randomUUID()

    const created = await browserApi(page, '/api/orders/checkout', {
      method: 'POST',
      body: requestBody,
      idempotencyKey,
    })
    expect(created.status).toBe(200)
    const createdOrder = data(created)
    expect(createdOrder?.['id']).toBeTruthy()
    expect(createdOrder?.['idempotentReplay']).toBe(false)

    const replay = await browserApi(page, '/api/orders/checkout', {
      method: 'POST',
      body: requestBody,
      idempotencyKey,
    })
    expect(replay.status).toBe(200)
    const replayOrder = data(replay)
    expect(replayOrder?.['id']).toBe(createdOrder?.['id'])
    expect(replayOrder?.['idempotentReplay']).toBe(true)

    const afterCheckout = await browserApi(page, '/api/cart')
    expect(afterCheckout.status).toBe(200)
    expect(cartItems(afterCheckout).map((entry) => entry['id'])).not.toContain(cartItemId)

    const orderId = createdOrder?.['id']
    const cancelled = await browserApi(page, `/api/orders/${orderId}/cancel`, {
      method: 'PUT',
      body: { cancellationReason: 'Phase 5 integrity cleanup' },
    })
    expect(cancelled.status).toBe(200)

    const orderAfterCancel = await browserApi(page, `/api/orders/${orderId}`)
    expect(orderAfterCancel.status).toBe(200)
    expect(data(orderAfterCancel)?.['orderStatus']).toBe('CANCELLED')

    const repeatedCancel = await browserApi(page, `/api/orders/${orderId}/cancel`, {
      method: 'PUT',
      body: { cancellationReason: 'Repeated cancellation must be rejected' },
    })
    expect(repeatedCancel.status).toBeGreaterThanOrEqual(400)
  })
})
