import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { platformApi, projectsApi, type Project, type TestCase } from './api'
import { ApiError } from '../../lib/api'
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
    const router = createMemoryRouter([{ path: '/projects/:projectId', element: <Outlet context={{ project, root: '/projects/project-1' }} />, children: [{ path: 'suites/:suiteId/cases/:caseId', element: <CasePage /> }] }], { initialEntries: ['/projects/project-1/suites/suite-1/cases/case-1'] })
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)

    expect(await screen.findByText('This case belongs to a suite in Trash.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run case' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move to trash' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save case and steps' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Case details' })).toBeInTheDocument()
    expect(screen.getByText('Smoke test')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Steps' })).toBeInTheDocument()
  })

  it('blocks internal navigation after case edits until the user confirms', async () => {
    vi.spyOn(projectsApi, 'getCase').mockResolvedValue(testCase)
    vi.spyOn(projectsApi, 'getSuite').mockResolvedValue({ id: 'suite-1', projectId: project.id, name: 'Checkout', status: 'ACTIVE', version: 3 })
    vi.spyOn(platformApi, 'options').mockResolvedValue({
      targetAllowedOrigins: [], targetConfigured: true, projectCreationEnabled: true, reportingAvailable: true, secretVariablesEnabled: true, executionWorkerEnabled: true,
      supportedStepActions: ['NAVIGATE'], supportedLocatorTypes: [], supportedLocatorRoles: [],
      stepActions: [{ action: 'NAVIGATE', label: 'Navigate', locator: false, input: true, expected: false, role: false, help: '/', inputRequirement: 'REQUIRED' }],
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const router = createMemoryRouter([{ path: '/projects/:projectId', element: <Outlet context={{ project, root: '/projects/project-1' }} />, children: [
      { path: 'suites/:suiteId/cases/:caseId', element: <CasePage /> },
      { path: 'executions', element: <p>Runs page</p> },
    ] }], { initialEntries: ['/projects/project-1/suites/suite-1/cases/case-1'] })
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)

    const name = await screen.findByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Updated homepage smoke' } })
    fireEvent.click(screen.getByRole('link', { name: 'Runs' }))

    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/projects/project-1/suites/suite-1/cases/case-1')
  })

  it('shows a correlation-aware retry when moving a case to Trash fails', async () => {
    vi.spyOn(projectsApi, 'getCase').mockResolvedValue(testCase)
    vi.spyOn(projectsApi, 'getSuite').mockResolvedValue({ id: 'suite-1', projectId: project.id, name: 'Checkout', status: 'ACTIVE', version: 3 })
    vi.spyOn(platformApi, 'options').mockResolvedValue({
      targetAllowedOrigins: [], targetConfigured: true, projectCreationEnabled: true, reportingAvailable: true, secretVariablesEnabled: true, executionWorkerEnabled: true,
      supportedStepActions: ['NAVIGATE'], supportedLocatorTypes: [], supportedLocatorRoles: [],
      stepActions: [{ action: 'NAVIGATE', label: 'Navigate', locator: false, input: true, expected: false, role: false, help: '/', inputRequirement: 'REQUIRED' }],
    })
    const archive = vi.spyOn(projectsApi, 'archiveCase')
      .mockRejectedValueOnce(new ApiError(503, 'Archive unavailable', { correlationId: 'corr-case-archive' }))
      .mockResolvedValue({ ...testCase, status: 'ARCHIVED', version: 3 })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const router = createMemoryRouter([{ path: '/projects/:projectId', element: <Outlet context={{ project, root: '/projects/project-1' }} />, children: [
      { path: 'suites/:suiteId/cases/:caseId', element: <CasePage /> },
      { path: 'trash', element: <p>Trash page</p> },
    ] }], { initialEntries: ['/projects/project-1/suites/suite-1/cases/case-1'] })
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)

    fireEvent.click(await screen.findByRole('button', { name: 'Move to trash' }))
    const dialog = await screen.findByRole('dialog', { name: 'Move Homepage smoke to Trash?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to trash' }))

    expect(await within(dialog).findByText('corr-case-archive')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry move to trash' }))
    await waitFor(() => expect(archive).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Trash page')).toBeInTheDocument()
  })

  it('explains the disabled worker and retries the same case run request', async () => {
    vi.spyOn(projectsApi, 'getCase').mockResolvedValue(testCase)
    vi.spyOn(projectsApi, 'getSuite').mockResolvedValue({ id: 'suite-1', projectId: project.id, name: 'Checkout', status: 'ACTIVE', version: 3 })
    vi.spyOn(platformApi, 'options').mockResolvedValue({
      targetAllowedOrigins: [], targetConfigured: true, projectCreationEnabled: true, reportingAvailable: true, secretVariablesEnabled: true, executionWorkerEnabled: false,
      supportedStepActions: ['NAVIGATE'], supportedLocatorTypes: [], supportedLocatorRoles: [],
      stepActions: [{ action: 'NAVIGATE', label: 'Navigate', locator: false, input: true, expected: false, role: false, help: '/', inputRequirement: 'REQUIRED' }],
    })
    const queue = vi.spyOn(projectsApi, 'queueCase').mockRejectedValue(new ApiError(503, 'Execution is temporarily unavailable', {
      code: 'execution_worker_disabled', correlationId: 'corr-worker-disabled',
    }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const router = createMemoryRouter([{ path: '/projects/:projectId', element: <Outlet context={{ project, root: '/projects/project-1' }} />, children: [
      { path: 'suites/:suiteId/cases/:caseId', element: <CasePage /> },
    ] }], { initialEntries: ['/projects/project-1/suites/suite-1/cases/case-1'] })
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)

    fireEvent.click(await screen.findByRole('button', { name: 'Run case' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Execution worker is disabled.')
    expect(alert).toHaveTextContent('corr-worker-disabled')
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(queue).toHaveBeenCalledTimes(2))
    expect(queue).toHaveBeenLastCalledWith('project-1', 'suite-1', 'case-1')
  })
})
