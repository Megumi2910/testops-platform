import { expect, test, type Page } from '@playwright/test'

const ecommerceBaseUrl = process.env.ECOMMERCE_E2E_BASE_URL
const ecommerceOrigin = ecommerceBaseUrl?.replace(/\/$/, '')
const customerAEmail = process.env.ECOMMERCE_E2E_CUSTOMER_EMAIL ?? 'mock.customer@example.test'
const customerAPassword = process.env.ECOMMERCE_E2E_CUSTOMER_PASSWORD ?? 'MockCustomer!123'
const customerBEmail = process.env.ECOMMERCE_E2E_CUSTOMER_B_EMAIL ?? 'mock.customer-b@example.test'
const customerBPassword = process.env.ECOMMERCE_E2E_CUSTOMER_B_PASSWORD ?? 'MockCustomerB!123'
const sellerAEmail = process.env.ECOMMERCE_E2E_SELLER_EMAIL ?? 'mock.seller@example.test'
const sellerAPassword = process.env.ECOMMERCE_E2E_SELLER_PASSWORD ?? 'MockSeller!123'
const sellerBEmail = process.env.ECOMMERCE_E2E_SELLER_B_EMAIL ?? 'mock.seller-b@example.test'
const sellerBPassword = process.env.ECOMMERCE_E2E_SELLER_B_PASSWORD ?? 'MockSellerB!123'

type JsonRecord = Record<string, unknown>
type ApiResult = { status: number; body: JsonRecord | null }

async function signIn(page: Page, email: string, password: string, destination = '/') {
  await page.goto(`${ecommerceOrigin}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mật khẩu').fill(password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(`${ecommerceOrigin}${destination}`)
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
      // Some error responses intentionally have no JSON body.
    }
    return { status: response.status, body }
  }, { path, init })
}

function rows(result: ApiResult): JsonRecord[] {
  const data = result.body?.data
  if (Array.isArray(data)) return data.filter(isJsonRecord)
  if (isJsonRecord(data) && Array.isArray(data.content)) return data.content.filter(isJsonRecord)
  if (isJsonRecord(data) && Array.isArray(data.items)) return data.items.filter(isJsonRecord)
  return []
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

test.describe('ecommerce Phase 5 role and tenant isolation', () => {
  test.skip(!ecommerceOrigin, 'Set ECOMMERCE_E2E_BASE_URL to run the isolated ecommerce role suite.')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  test('customers can read only their own cart, orders, and message threads', async ({ browser }) => {
    const customerAContext = await browser.newContext()
    const customerBContext = await browser.newContext()
    const customerA = await customerAContext.newPage()
    const customerB = await customerBContext.newPage()

    try {
      await signIn(customerA, customerAEmail, customerAPassword)
      const cartA = await browserApi(customerA, '/api/cart')
      const ordersA = await browserApi(customerA, '/api/orders?page=0&size=50')
      const threadsA = await browserApi(customerA, '/api/messages/threads')
      expect(cartA.status).toBe(200)
      expect(ordersA.status).toBe(200)
      expect(threadsA.status).toBe(200)

      const customerAItem = rows(cartA).at(0)
      const customerAOrder = rows(ordersA).find((order) => order['orderNumber'] === 'MOCK-ORDER-001')
      const customerAThread = rows(threadsA).at(0)
      expect(customerAItem?.['id']).toBeTruthy()
      expect(customerAOrder?.['id']).toBeTruthy()
      expect(customerAThread?.['id']).toBeTruthy()

      await signIn(customerB, customerBEmail, customerBPassword)
      const cartB = await browserApi(customerB, '/api/cart')
      const ordersB = await browserApi(customerB, '/api/orders?page=0&size=50')
      expect(cartB.status).toBe(200)
      expect(ordersB.status).toBe(200)
      expect(rows(cartB).map((item) => item['id'])).not.toContain(customerAItem?.['id'])
      expect(rows(ordersB).map((order) => order['orderNumber'])).not.toContain('MOCK-ORDER-001')
      expect(rows(ordersB).map((order) => order['orderNumber'])).toContain('MOCK-ORDER-CANCEL-001')

      const foreignOrder = await browserApi(customerB, `/api/orders/${customerAOrder?.['id']}`)
      const foreignThread = await browserApi(customerB, `/api/messages/threads/${customerAThread?.['id']}`)
      const foreignMessages = await browserApi(customerB, `/api/messages/threads/${customerAThread?.['id']}/messages`)
      expect(foreignOrder.status).toBeGreaterThanOrEqual(400)
      expect(foreignThread.status).toBe(404)
      expect(foreignMessages.status).toBe(404)
    } finally {
      await customerAContext.close()
      await customerBContext.close()
    }
  })

  test('seller product listings contain only the authenticated seller inventory', async ({ browser }) => {
    const sellerAContext = await browser.newContext()
    const sellerBContext = await browser.newContext()
    const sellerA = await sellerAContext.newPage()
    const sellerB = await sellerBContext.newPage()

    try {
      await signIn(sellerA, sellerAEmail, sellerAPassword, '/seller')
      const productsA = await browserApi(sellerA, '/api/seller/products?page=0&size=50')
      expect(productsA.status).toBe(200)
      expect(rows(productsA).length).toBeGreaterThan(0)
      expect(rows(productsA).map((product) => product['sku'])).not.toContain('MOCK-SELLER-B-001')

      await signIn(sellerB, sellerBEmail, sellerBPassword, '/seller')
      const productsB = await browserApi(sellerB, '/api/seller/products?page=0&size=50')
      expect(productsB.status).toBe(200)
      expect(rows(productsB).map((product) => product['sku'])).toContain('MOCK-SELLER-B-001')
      expect(rows(productsB).map((product) => product['sku'])).not.toContain('MOCK-TSHIRT-001')
    } finally {
      await sellerAContext.close()
      await sellerBContext.close()
    }
  })
})
