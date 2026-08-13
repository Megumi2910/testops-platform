import { expect, test, type Page } from '@playwright/test'

const ecommerceBaseUrl = process.env.ECOMMERCE_E2E_BASE_URL
const ecommerceOrigin = ecommerceBaseUrl?.replace(/\/$/, '')
const messagingEnabled = process.env.ECOMMERCE_E2E_MESSAGING === 'true'
const customerEmail = process.env.ECOMMERCE_E2E_CUSTOMER_EMAIL ?? 'mock.customer@example.test'
const customerPassword = process.env.ECOMMERCE_E2E_CUSTOMER_PASSWORD ?? 'MockCustomer!123'
const sellerEmail = process.env.ECOMMERCE_E2E_SELLER_B_EMAIL ?? 'mock.seller-b@example.test'
const sellerPassword = process.env.ECOMMERCE_E2E_SELLER_B_PASSWORD ?? 'MockSellerB!123'

type JsonRecord = Record<string, unknown>
type ApiResult = { status: number; body: JsonRecord | null }

async function signIn(page: Page, email: string, password: string, expectedPath = '/') {
  await page.goto(`${ecommerceOrigin}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mật khẩu').fill(password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(`${ecommerceOrigin}${expectedPath}`)
}

async function browserApi(page: Page, path: string): Promise<ApiResult> {
  return page.evaluate(async (requestPath) => {
    const token = window.localStorage.getItem('token')
    const response = await fetch(requestPath, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    let body: JsonRecord | null = null
    try {
      body = await response.json() as JsonRecord
    } catch {
      // Some error responses intentionally have no JSON body.
    }
    return { status: response.status, body }
  }, path)
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function threadRows(result: ApiResult): JsonRecord[] {
  const data = result.body?.['data']
  return Array.isArray(data) ? data.filter(isJsonRecord) : []
}

function threadWithSeller(rows: JsonRecord[]): JsonRecord | undefined {
  return rows.find((thread) => {
    const user1 = thread['user1']
    const user2 = thread['user2']
    const topic = thread['topic']
    return isJsonRecord(topic) && topic['productId'] != null &&
      ((isJsonRecord(user1) && user1['role'] === 'SELLER') || (isJsonRecord(user2) && user2['role'] === 'SELLER'))
  })
}

test.describe('ecommerce Phase 5 two-user messaging', () => {
  test.skip(!ecommerceOrigin || !messagingEnabled, 'Set ECOMMERCE_E2E_BASE_URL and ECOMMERCE_E2E_MESSAGING=true after resetting the isolated E2E stack.')
  test.setTimeout(60_000)

  test('delivers a customer message over WebSocket without REST fallback', async ({ browser }) => {
    const customerContext = await browser.newContext()
    const sellerContext = await browser.newContext()
    const customer = await customerContext.newPage()
    const seller = await sellerContext.newPage()

    try {
      await signIn(customer, customerEmail, customerPassword)
      const customerThreads = await browserApi(customer, '/api/messages/threads')
      expect(customerThreads.status).toBe(200)
      const customerThread = threadWithSeller(threadRows(customerThreads))
      expect(customerThread?.['id']).toBeTruthy()

      await signIn(seller, sellerEmail, sellerPassword, '/seller')
      const sellerThreads = await browserApi(seller, '/api/messages/threads')
      expect(sellerThreads.status).toBe(200)
      expect(threadRows(sellerThreads).map((thread) => thread['id'])).toContain(customerThread?.['id'])

      const threadId = customerThread?.['id']
      await customer.goto(`${ecommerceOrigin}/messages/${threadId}`, { waitUntil: 'networkidle' })
      await seller.goto(`${ecommerceOrigin}/messages/${threadId}`, { waitUntil: 'networkidle' })
      await expect(customer.getByRole('textbox', { name: 'Message text' })).toBeVisible()
      await expect(seller.getByRole('textbox', { name: 'Message text' })).toBeVisible()

      await customer.route('**/api/messages/threads/*/messages', async (route) => {
        if (route.request().method() === 'POST') {
          await route.abort('blockedbyclient')
          return
        }
        await route.continue()
      })

      const message = `[QA-WS-${Date.now()}] Customer to seller`
      await customer.getByRole('textbox', { name: 'Message text' }).fill(message)
      await expect(customer.getByRole('button', { name: 'Send message' })).toBeEnabled()
      await customer.getByRole('button', { name: 'Send message' }).click()

      await expect(seller.locator('p:visible').filter({ hasText: message }).first()).toBeVisible({ timeout: 10_000 })
      await expect(customer.locator('p:visible').filter({ hasText: message }).first()).toBeVisible()
    } finally {
      await customerContext.close()
      await sellerContext.close()
    }
  })
})
