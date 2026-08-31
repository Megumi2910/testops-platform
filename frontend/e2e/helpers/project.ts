import { expect, type Browser, type Page } from '@playwright/test'

import { registerAndVerify } from './auth'

export const e2eBaseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
export const e2eTargetOrigin = process.env.E2E_TARGET_ORIGIN ?? 'http://localhost:3201'

export function requireAdminCredentials() {
  if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
    throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required for the P7 administrator matrix.')
  }
  return { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD }
}

export async function registerInContext(browser: Browser, email: string, displayName = 'P7 User') {
  const context = await browser.newContext({ baseURL: e2eBaseUrl })
  const page = await context.newPage()
  await registerAndVerify(page, email, { displayName })
  return { context, page }
}

export async function createProject(page: Page, name: string) {
  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Target origin').selectOption({ label: e2eTargetOrigin })
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

export async function openMembers(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/members`)
  await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible()
}

export async function openVariables(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/variables`)
  await expect(page.getByRole('heading', { name: 'Variables', exact: true })).toBeVisible()
}

export async function createSuite(page: Page, projectId: string, name: string) {
  await page.goto(`/projects/${projectId}/suites`)
  await page.getByRole('textbox', { name: 'Suite name' }).fill(name)
  await page.getByRole('button', { name: 'Add suite', exact: true }).click()
  await page.getByRole('link', { name: new RegExp(name) }).click()
  await expect(page.getByRole('heading', { name: new RegExp(name) })).toBeVisible()
  return page.url().split('/').pop()!
}
