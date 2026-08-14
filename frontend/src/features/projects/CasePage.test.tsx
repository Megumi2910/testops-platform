import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { platformApi, projectsApi, type Project, type TestCase } from './api'
import { CasePage } from './CasePage'

const project: Project = {
  id: 'project-1',
  name: 'Storefront',
  targetOrigin: 'http://localhost:3001',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-08-14T00:00:00Z',
  updatedAt: '2026-08-14T00:00:00Z',
  currentUserProjectRole: 'PROJECT_MANAGER',
  permissions: ['PROJECT_VIEW', 'DEFINITION_VIEW', 'DEFINITION_MANAGE', 'EXECUTION_START'],
  onboarding: { suiteCount: 1, caseCount: 1, readyCaseCount: 1, executionCount: 0 },
}

const testCase: TestCase = {
  id: 'case-1',
  suiteId: 'suite-1',
  name: 'Homepage smoke',
  description: 'Smoke test',
  status: 'READY',
  priority: 'MEDIUM',
  retryCount: 0,
  dataIsolation: true,
  version: 2,
  steps: [{ id: 'step-1', position: 0, action: 'NAVIGATE', inputValue: '/' }],
}

afterEach(() => vi.restoreAllMocks())

describe('CasePage lifecycle guard', () => {
  it('keeps a direct case link read-only while its parent suite is archived', async () => {
    vi.spyOn(projectsApi, 'getCase').mockResolvedValue(testCase)
    vi.spyOn(projectsApi, 'getSuite').mockResolvedValue({ id: 'suite-1', projectId: project.id, name: 'Archived suite', status: 'ARCHIVED', version: 3 })
    vi.spyOn(platformApi, 'options').mockResolvedValue({
      targetAllowedOrigins: [],
      targetConfigured: true,
      projectCreationEnabled: true,
      reportingAvailable: true,
      secretVariablesEnabled: true,
      executionWorkerEnabled: true,
      supportedStepActions: ['NAVIGATE'],
      supportedLocatorTypes: [],
      supportedLocatorRoles: [],
      stepActions: [{ action: 'NAVIGATE', label: 'Navigate', locator: false, input: true, expected: false, role: false, help: '/', inputRequirement: 'REQUIRED' }],
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/projects/project-1/suites/suite-1/cases/case-1']}><Routes><Route path="/projects/:projectId" element={<Outlet context={{ project, root: '/projects/project-1' }} />}><Route path="suites/:suiteId/cases/:caseId" element={<CasePage />} /></Route></Routes></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('This case belongs to a suite in Trash.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run case' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move to trash' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save case and steps' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'Steps' })).toBeInTheDocument()
  })
})
