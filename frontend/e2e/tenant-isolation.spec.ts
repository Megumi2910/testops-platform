import { expect, test } from '@playwright/test'

import { registerInContext, createProject } from './helpers/project'
import { registerAndVerify } from './helpers/auth'

test('a non-member cannot read a foreign project or its nested resources', async ({ page, browser }) => {
  test.setTimeout(120_000)
  const runId = Date.now()
  const ownerEmail = `p7-tenant-owner-${runId}@example.test`
  const foreignEmail = `p7-tenant-foreign-${runId}@example.test`
  const outsiderEmail = `p7-tenant-outsider-${runId}@example.test`
  await registerAndVerify(page, ownerEmail, { displayName: 'P7 Owner' })
  const ownerProjectId = await createProject(page, `P7 owner ${runId}`)

  const foreign = await registerInContext(browser, foreignEmail, 'P7 Foreign')
  await createProject(foreign.page, `P7 foreign ${runId}`)
  const outsider = await registerInContext(browser, outsiderEmail, 'P7 Outsider')

  const projectResponse = outsider.page.waitForResponse(response => response.url().endsWith(`/api/v1/projects/${ownerProjectId}`))
  await outsider.page.goto(`/projects/${ownerProjectId}`)
  expect([403, 404]).toContain((await projectResponse).status())
  await expect(outsider.page.getByRole('alert')).toContainText(/Unable to load this project|not available/i)

  await outsider.page.goto(`/projects/${ownerProjectId}/members`)
  await expect(outsider.page.getByRole('alert')).toContainText(/Unable to load|restricted|not available/i)

  await foreign.context.close()
  await outsider.context.close()
  await page.goto('/')
})
