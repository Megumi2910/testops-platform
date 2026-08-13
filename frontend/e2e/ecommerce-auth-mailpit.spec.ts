import { expect, test } from '@playwright/test'

const ecommerceBaseUrl = process.env.ECOMMERCE_E2E_BASE_URL
const mailpitUrl = process.env.MAILPIT_URL
const ecommerceOrigin = ecommerceBaseUrl?.replace(/\/$/, '')
const mailpitOrigin = mailpitUrl?.replace(/\/$/, '')
const customerEmail = process.env.ECOMMERCE_E2E_CUSTOMER_EMAIL ?? 'mock.customer@example.test'
const customerPassword = process.env.ECOMMERCE_E2E_CUSTOMER_PASSWORD
const unverifiedEmail = process.env.ECOMMERCE_E2E_UNVERIFIED_EMAIL ?? 'mock.unverified@example.test'
const unverifiedPassword = process.env.ECOMMERCE_E2E_UNVERIFIED_PASSWORD

type MailpitMessage = {
  ID: string
  Subject: string
  To: Array<{ Address: string }>
  Text?: string
}

test.describe('ecommerce authentication and Mailpit flows', () => {
  test.skip(
    !ecommerceOrigin || !mailpitOrigin || !customerPassword || !unverifiedPassword,
    'Set ECOMMERCE_E2E_BASE_URL, MAILPIT_URL, ECOMMERCE_E2E_CUSTOMER_PASSWORD, and ECOMMERCE_E2E_UNVERIFIED_PASSWORD to run the isolated auth suite.',
  )
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  const messagesEndpoint = () => `${mailpitOrigin}/api/v1/messages`

  const clearMailbox = async () => {
    const response = await fetch(messagesEndpoint(), { method: 'DELETE' })
    expect(response.ok).toBeTruthy()
  }

  const waitForMessage = async (recipient: string, subjectPattern: RegExp): Promise<MailpitMessage> => {
    let messageId = ''
    await expect.poll(async () => {
      const response = await fetch(messagesEndpoint())
      if (!response.ok) return ''
      const payload = await response.json() as { messages?: MailpitMessage[] }
      const message = payload.messages?.find((candidate) =>
        candidate.To?.some((to) => to.Address.toLowerCase() === recipient.toLowerCase())
        && subjectPattern.test(candidate.Subject),
      )
      messageId = message?.ID ?? ''
      return messageId
    }, { timeout: 30_000, intervals: [250, 500, 1_000] }).not.toBe('')

    const detailResponse = await fetch(`${messagesEndpoint().replace('/messages', `/message/${messageId}`)}`)
    expect(detailResponse.ok).toBeTruthy()
    return await detailResponse.json() as MailpitMessage
  }

  const extractLink = (message: MailpitMessage, path: 'verify-email' | 'reset-password') => {
    const link = message.Text?.match(new RegExp(`https?://[^\\s<>"']+/${path}\\?token=[^\\s<>"']+`))?.[0]
      ?.replace(/[),.;]+$/, '')
    expect(link, `Mailpit message did not contain a ${path} link`).toBeTruthy()
    const parsed = new URL(link as string)
    expect(parsed.origin).toBe(ecommerceOrigin)
    expect(parsed.searchParams.get('token')).toBeTruthy()
    return parsed.toString()
  }

  test.beforeAll(async () => {
    await clearMailbox()
  })

  test('registration delivers a verification link that verifies the account', async ({ page }) => {
    const email = `phase5-${Date.now()}@example.test`
    const password = process.env.ECOMMERCE_E2E_REGISTRATION_PASSWORD ?? 'Phase5Registration!123'
    const phone = `090${Date.now().toString().slice(-7)}`

    await page.goto(`${ecommerceOrigin}/register`, { waitUntil: 'networkidle' })
    await page.getByLabel('Tên').fill('Phase')
    await page.getByLabel('Họ').fill('Five')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Số điện thoại').fill(phone)
    await page.locator('#password').fill(password)
    await page.locator('#confirmPassword').fill(password)
    await page.locator('#agree-terms').check()
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click()

    await expect(page.getByText(/Đăng ký thành công/)).toBeVisible()
    await expect(page).toHaveURL(`${ecommerceOrigin}/login?registered=true`, { timeout: 10_000 })

    const message = await waitForMessage(email, /Verify Account|Xác thực tài khoản/i)
    const verificationLink = extractLink(message, 'verify-email')
    await page.goto(verificationLink, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Xác thực thành công!' })).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Email của bạn đã được xác thực thành công!')
  })

  test('unverified login exposes recovery and enforces resend cooldown', async ({ page }) => {
    await page.goto(`${ecommerceOrigin}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(unverifiedEmail)
    await page.getByLabel('Mật khẩu').fill(unverifiedPassword as string)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page).toHaveURL(`${ecommerceOrigin}/`)

    await expect(page.getByText('Tài khoản của bạn chưa được xác thực')).toBeVisible({ timeout: 5_000 })
    await page.getByRole('link', { name: 'Xác thực ngay' }).click()
    await expect(page).toHaveURL(`${ecommerceOrigin}/verify-email/request`)
    await expect(page.getByRole('heading', { name: 'Xác thực email' })).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Email xác thực đã được gửi')
    await waitForMessage(unverifiedEmail, /Verify Account|Xác thực tài khoản/i)

    await page.goto(`${ecommerceOrigin}/`, { waitUntil: 'networkidle' })
    await expect(page.getByText('Tài khoản của bạn chưa được xác thực')).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Gửi email xác thực' }).click()
    await expect(page.getByText(/Try again in \d+ seconds/i)).toBeVisible()
  })

  test('forgot-password delivers a reset link and completes the reset form', async ({ page }) => {
    await page.goto(`${ecommerceOrigin}/forgot-password`, { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(customerEmail)
    await page.getByRole('button', { name: 'Gửi link đặt lại mật khẩu' }).click()
    await expect(page.getByRole('heading', { name: 'Email đã được gửi!' })).toBeVisible()

    const message = await waitForMessage(customerEmail, /Reset Password|Đặt lại mật khẩu/i)
    const resetLink = extractLink(message, 'reset-password')
    await page.goto(resetLink, { waitUntil: 'networkidle' })
    const newPassword = process.env.ECOMMERCE_E2E_RESET_PASSWORD ?? 'Phase5Reset!123'
    await page.getByLabel('Mật khẩu mới').fill(newPassword)
    await page.getByLabel('Xác nhận mật khẩu').fill(newPassword)
    await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click()
    await expect(page.getByRole('heading', { name: 'Đặt lại mật khẩu thành công!' })).toBeVisible()
  })
})
