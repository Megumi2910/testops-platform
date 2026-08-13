import { expect, test, type Page } from '@playwright/test'

const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'

async function latestOtp(email: string) {
  const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  expect(search.ok).toBeTruthy()
  const result = await search.json() as { messages: Array<{ ID: string }> }
  expect(result.messages.length).toBeGreaterThan(0)
  const message = await (await fetch(`${mailpit}/api/v1/message/${result.messages[0].ID}`)).json() as { Text?: string; HTML?: string }
  const otp = (message.Text ?? message.HTML ?? '').match(/\b\d{6}\b/)?.[0]
  expect(otp).toBeTruthy()
  return otp!
}

async function registerAndVerify(page: Page, email: string) {
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Project Owner')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct-horse-battery-staple')
  await page.getByRole('button', { name: 'Send verification code' }).click()
  await expect(page).toHaveURL(/verify-email/)
  await page.getByLabel('Verification code').fill(await latestOtp(email))
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
}

test('verified users can create and find a project', async ({ page }) => {
  const email = `project-${Date.now()}@example.test`
  const projectName = `Checkout regression ${Date.now()}`
  await registerAndVerify(page, email)

  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Create project' })).toBeVisible()
  await page.getByLabel('Name').fill(projectName)
  await page.getByLabel('Description').fill('Project created through the managed workspace.')
  await page.getByLabel('Target origin').selectOption({ label: 'http://frontend:8080' })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible()
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await page.getByLabel('Filter projects').fill(projectName)
  await expect(page.getByRole('link', { name: projectName })).toBeVisible()
})

test('project managers can edit a project and receive a duplicate-name conflict', async ({ page }) => {
  const email = `project-edit-${Date.now()}@example.test`
  const projectName = `Editable project ${Date.now()}`
  const duplicateName = `Existing project ${Date.now()}`
  await registerAndVerify(page, email)

  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await page.getByLabel('Name').fill(projectName)
  await page.getByLabel('Target origin').selectOption({ label: 'http://frontend:8080' })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)

  await page.getByRole('link', { name: 'Edit project', exact: true }).click()
  await page.getByLabel('Name').fill(`${projectName} updated`)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: `${projectName} updated`, exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await page.getByLabel('Name').fill(duplicateName)
  await page.getByLabel('Target origin').selectOption({ label: 'http://frontend:8080' })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)

  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await page.getByLabel('Name').fill(duplicateName)
  await page.getByLabel('Target origin').selectOption({ label: 'http://frontend:8080' })
  const response = page.waitForResponse(request => request.request().method() === 'POST' && request.url().endsWith('/api/v1/projects'))
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect((await response).status()).toBe(409)
  await expect(page.getByRole('alert')).toContainText('Project name is already in use')
})
