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

function rows(result: ApiResult): JsonRecord[] {
  const value = result.body?.['data']
  if (Array.isArray(value)) return value.filter(isRecord)
  if (isRecord(value) && Array.isArray(value['content'])) return value['content'].filter(isRecord)
  if (isRecord(value) && Array.isArray(value['items'])) return value['items'].filter(isRecord)
  return []
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
      // Some transport failures intentionally have no JSON body.
    }
    return { status: response.status, body }
  }, { path, init })
}

test.describe('ecommerce Phase 5 final-unit concurrency', () => {
  test.skip(!ecommerceOrigin || !checkoutEnabled, 'Set ECOMMERCE_E2E_BASE_URL and ECOMMERCE_E2E_CHECKOUT=true after resetting the isolated E2E stack.')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  test('allows exactly one checkout for the one-unit QA fixture and restores stock once', async ({ browser }) => {
    const customerAContext = await browser.newContext()
    const customerBContext = await browser.newContext()
    const customerA = await customerAContext.newPage()
    const customerB = await customerBContext.newPage()
    const sku = 'MOCK-CONCURRENCY-001'
    let successfulOrder: { page: Page; id: unknown } | undefined

    try {
      await signIn(customerA, customerAEmail, customerAPassword)
      await signIn(customerB, customerBEmail, customerBPassword)

      const publicProducts = await browserApi(customerA, '/api/products?size=100')
      const product = rows(publicProducts).find((entry) => entry['sku'] === sku)
      expect(product?.['id']).toBeTruthy()
      expect(product?.['stock']).toBe(1)

      const productId = product?.['id']
      await expect.poll(async () => (await browserApi(customerA, `/api/products/${productId}`)).status).toBe(200)
      const request = {
        method: 'POST',
        body: {
          isBuyNow: true,
          productId,
          quantity: 1,
          shippingAddress: '1 QA Concurrency Street',
          phoneNumber: '0912345678',
          paymentMethod: 'COD',
          notes: 'Phase 5 final-unit concurrency run',
        },
        idempotencyKey: crypto.randomUUID(),
      }
      const [resultA, resultB] = await Promise.all([
        browserApi(customerA, '/api/orders/checkout', request),
        browserApi(customerB, '/api/orders/checkout', { ...request, idempotencyKey: crypto.randomUUID() }),
      ])
      successfulOrder = resultA.status === 200
        ? { page: customerA, id: data(resultA)?.['id'] }
        : resultB.status === 200
          ? { page: customerB, id: data(resultB)?.['id'] }
          : undefined
      const successes = [resultA, resultB].filter((result) => result.status === 200)
      const rejected = [resultA, resultB].filter((result) => result.status >= 400 && result.status < 500)
      expect(successes, JSON.stringify([resultA, resultB])).toHaveLength(1)
      expect(rejected, JSON.stringify([resultA, resultB])).toHaveLength(1)

      expect(successfulOrder).toBeTruthy()
      if (!successfulOrder) throw new Error('No checkout request succeeded')
      expect(successfulOrder.id).toBeTruthy()

      const reserved = await browserApi(customerA, `/api/products/${productId}`)
      expect(data(reserved)?.['stock']).toBe(0)

      const cancelled = await browserApi(successfulOrder.page, `/api/orders/${successfulOrder.id}/cancel`, {
        method: 'PUT',
        body: { cancellationReason: 'Phase 5 concurrency cleanup' },
      })
      expect(cancelled.status).toBe(200)
      const restored = await browserApi(customerA, `/api/products/${productId}`)
      expect(data(restored)?.['stock']).toBe(1)
    } finally {
      if (successfulOrder?.id) {
        const order = await browserApi(successfulOrder.page, `/api/orders/${successfulOrder.id}`)
        if (data(order)?.['orderStatus'] !== 'CANCELLED') {
          await browserApi(successfulOrder.page, `/api/orders/${successfulOrder.id}/cancel`, {
            method: 'PUT',
            body: { cancellationReason: 'Phase 5 concurrency cleanup' },
          })
        }
      }
      await customerAContext.close()
      await customerBContext.close()
    }
  })
})
