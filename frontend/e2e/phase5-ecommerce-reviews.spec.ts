import { expect, test, type Page } from '@playwright/test'

const ecommerceBaseUrl = process.env.ECOMMERCE_E2E_BASE_URL
const ecommerceOrigin = ecommerceBaseUrl?.replace(/\/$/, '')
const reviewsEnabled = process.env.ECOMMERCE_E2E_REVIEWS === 'true'
const customerEmail = process.env.ECOMMERCE_E2E_CUSTOMER_EMAIL ?? 'mock.customer@example.test'
const customerPassword = process.env.ECOMMERCE_E2E_CUSTOMER_PASSWORD ?? 'MockCustomer!123'
const customerBEmail = process.env.ECOMMERCE_E2E_CUSTOMER_B_EMAIL ?? 'mock.customer-b@example.test'
const customerBPassword = process.env.ECOMMERCE_E2E_CUSTOMER_B_PASSWORD ?? 'MockCustomerB!123'

type JsonRecord = Record<string, unknown>
type ApiResult = { status: number; body: JsonRecord | null }

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function responseData(result: ApiResult): JsonRecord | null {
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
      // Empty responses are valid for cleanup operations.
    }
    return { status: response.status, body }
  }, { path, init })
}

test.describe('ecommerce Phase 5 review eligibility and ownership', () => {
  test.skip(!ecommerceOrigin || !reviewsEnabled, 'Set ECOMMERCE_E2E_BASE_URL and ECOMMERCE_E2E_REVIEWS=true after resetting the isolated E2E stack.')
  test.setTimeout(60_000)

  test('allows one completed-purchase review and rejects a duplicate', async ({ page }) => {
    await signIn(page, customerEmail, customerPassword)

    const products = await browserApi(page, '/api/products?size=100')
    const rows = Array.isArray(products.body?.['data']) ? products.body?.['data'].filter(isRecord) : []
    const product = rows.find((entry) => entry['sku'] === 'MOCK-AUDIO-001')
    expect(product?.['id']).toBeTruthy()

    const productId = product?.['id']
    await page.goto(`${ecommerceOrigin}/product/${productId}`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: 'Viết đánh giá' })).toBeVisible({ timeout: 10_000 })
    const eligibility = await browserApi(page, `/api/reviews/product/${productId}/eligibility`)
    expect(eligibility.status).toBe(200)
    expect(eligibility.body?.['data']).toBe(true)

    let reviewId: unknown
    try {
      const created = await browserApi(page, '/api/reviews', {
        method: 'POST',
        body: {
          productId,
          rating: 4,
          comment: `[QA-REVIEW-${Date.now()}] Verified purchase review`,
        },
      })
      expect(created.status).toBe(201)
      const review = responseData(created)
      expect(review?.['isVerifiedPurchase']).toBe(true)
      expect(review?.['userId']).toBeTruthy()
      reviewId = review?.['id']

      const duplicate = await browserApi(page, '/api/reviews', {
        method: 'POST',
        body: { productId, rating: 5, comment: 'duplicate should be rejected' },
      })
      expect(duplicate.status).toBe(400)

      const afterCreate = await browserApi(page, `/api/reviews/product/${productId}/eligibility`)
      expect(afterCreate.status).toBe(200)
      expect(afterCreate.body?.['data']).toBe(false)
    } finally {
      if (reviewId) {
        const deleted = await browserApi(page, `/api/reviews/${reviewId}`, { method: 'DELETE' })
        expect([200, 204]).toContain(deleted.status)
      }
    }
  })

  test('rejects a customer without a completed purchase', async ({ browser }) => {
    const customerAContext = await browser.newContext()
    const customerBContext = await browser.newContext()
    const customerA = await customerAContext.newPage()
    const customerB = await customerBContext.newPage()

    try {
      await signIn(customerA, customerEmail, customerPassword)
      await signIn(customerB, customerBEmail, customerBPassword)
      const products = await browserApi(customerA, '/api/products?size=100')
      const rows = Array.isArray(products.body?.['data']) ? products.body?.['data'].filter(isRecord) : []
      const product = rows.find((entry) => entry['sku'] === 'MOCK-AUDIO-001')
      expect(product?.['id']).toBeTruthy()

      const eligibility = await browserApi(customerB, `/api/reviews/product/${product?.['id']}/eligibility`)
      expect(eligibility.status).toBe(200)
      expect(eligibility.body?.['data']).toBe(false)
      await customerB.goto(`${ecommerceOrigin}/product/${product?.['id']}`, { waitUntil: 'networkidle' })
      await expect(customerB.getByRole('button', { name: 'Viết đánh giá' })).toHaveCount(0)
      await expect(customerB.getByText('Bạn cần mua sản phẩm này trước khi có thể đánh giá.')).toBeVisible({ timeout: 10_000 })

      const rejected = await browserApi(customerB, '/api/reviews', {
        method: 'POST',
        body: { productId: product?.['id'], rating: 5, comment: 'not eligible' },
      })
      expect(rejected.status).toBe(400)
    } finally {
      await customerAContext.close()
      await customerBContext.close()
    }
  })
})
