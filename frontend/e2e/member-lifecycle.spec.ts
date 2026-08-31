import { expect, test } from '@playwright/test'

import { registerInContext, createProject, e2eBaseUrl, openMembers } from './helpers/project'
import { registerAndVerify } from './helpers/auth'

test('member lifecycle covers duplicate, role, stale, removal, and final-manager boundaries', async ({ page, browser }) => {
  test.setTimeout(120_000)
  const runId = Date.now()
  const ownerEmail = `p7-member-owner-${runId}@example.test`
  const memberEmail = `p7-member-user-${runId}@example.test`
  const staleEmail = `p7-member-stale-${runId}@example.test`
  await registerAndVerify(page, ownerEmail, { displayName: 'P7 Project Manager' })
  const member = await registerInContext(browser, memberEmail, 'P7 Member')
  const stale = await registerInContext(browser, staleEmail, 'P7 Stale Member')
  const projectId = await createProject(page, `P7 members ${runId}`)
  await openMembers(page, projectId)

  await page.getByLabel('Member email').fill(memberEmail)
  await page.getByLabel('Member role').selectOption('TESTER')
  await page.getByRole('button', { name: 'Add member', exact: true }).click()
  const memberRow = page.getByRole('listitem').filter({ hasText: memberEmail })
  await expect(memberRow).toBeVisible()
  await page.getByLabel('Member email').fill(memberEmail)
  const duplicate = page.waitForResponse(response => response.url().endsWith('/members') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Add member', exact: true }).click()
  expect((await duplicate).status()).toBe(409)
  await expect(page.getByText(/already a project member/i)).toBeVisible()

  await memberRow.getByLabel(`Role for P7 Member`).selectOption('VIEWER')
  await memberRow.getByRole('button', { name: 'Save role', exact: true }).click()
  await expect(memberRow).toContainText('VIEWER')
  await expect(memberRow).toContainText('Effective permissions:')

  await page.getByLabel('Member email').fill(staleEmail)
  await page.getByLabel('Member role').selectOption('TESTER')
  await page.getByRole('button', { name: 'Add member', exact: true }).click()
  const staleRow = page.getByRole('listitem').filter({ hasText: staleEmail })
  await staleRow.getByLabel('Role for P7 Stale Member').selectOption('VIEWER')
  await page.route(`**/api/v1/projects/${projectId}/members/*`, async route => {
    if (route.request().method() !== 'PUT') return route.continue()
    const body = JSON.parse(route.request().postData() ?? '{}')
    await route.continue({ postData: JSON.stringify({ ...body, projectVersion: 0 }) })
  })
  const staleResponse = page.waitForResponse(response => response.url().includes('/members/') && response.request().method() === 'PUT')
  await staleRow.getByRole('button', { name: 'Save role', exact: true }).click()
  expect((await staleResponse).status()).toBe(409)
  await expect(page.getByText(/project changed|Reloaded data/i)).toBeVisible()
  await page.unroute(`**/api/v1/projects/${projectId}/members/*`)

  const ownerRow = page.getByRole('listitem').filter({ hasText: ownerEmail })
  await ownerRow.getByRole('button', { name: 'Remove', exact: true }).click()
  const finalManager = page.waitForResponse(response => response.url().includes('/members/') && response.request().method() === 'DELETE')
  await page.getByRole('button', { name: 'Remove member', exact: true }).click()
  expect((await finalManager).status()).toBe(409)
  await expect(page.getByText(/final project manager/i)).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  await memberRow.getByRole('button', { name: 'Remove', exact: true }).click()
  await page.getByRole('button', { name: 'Remove member', exact: true }).click()
  await expect(page.getByRole('listitem').filter({ hasText: memberEmail })).toHaveCount(0)
  await member.context.close()
  await stale.context.close()
  expect(e2eBaseUrl).toMatch(/^http/)
})
