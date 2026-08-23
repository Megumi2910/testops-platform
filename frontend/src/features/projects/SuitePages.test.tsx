import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { ApiError } from '../../lib/api'
import { projectsApi, type Project, type Suite } from './api'
import { SuitePage, SuitesPage } from './SuitePages'

const project: Project = {
  id: 'project-1', name: 'Storefront', targetOrigin: 'http://localhost:3201', status: 'ACTIVE', version: 4,
  createdAt: '2026-08-13T00:00:00Z', updatedAt: '2026-08-13T00:00:00Z', currentUserProjectRole: 'PROJECT_MANAGER',
  permissions: ['PROJECT_VIEW', 'DEFINITION_VIEW', 'DEFINITION_MANAGE', 'EXECUTION_START'], onboarding: { suiteCount: 1, caseCount: 0, readyCaseCount: 0, executionCount: 0 },
}

const suite: Suite = { id: 'suite-1', projectId: project.id, name: 'Checkout', description: 'Checkout smoke tests', status: 'ACTIVE', version: 2 }

afterEach(() => vi.restoreAllMocks())

describe('suite recovery surfaces', () => {
  it('refetches a failed suite list with its correlation reference', async () => {
    const suites = vi.spyOn(projectsApi, 'suites')
      .mockRejectedValueOnce(new ApiError(503, 'Suites unavailable', { correlationId: 'corr-suite-list' }))
      .mockResolvedValue([])

    renderProjectRoute('suites', <SuitesPage />)

    expect(await screen.findByText('corr-suite-list')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload suites' }))
    expect(await screen.findByRole('heading', { name: 'No suites yet' })).toBeInTheDocument()
    expect(suites).toHaveBeenCalledTimes(2)
  })

  it('refetches a failed suite detail', async () => {
    const getSuite = vi.spyOn(projectsApi, 'getSuite')
      .mockRejectedValueOnce(new ApiError(503, 'Suite unavailable', { correlationId: 'corr-suite-load' }))
      .mockResolvedValue(suite)
    vi.spyOn(projectsApi, 'cases').mockResolvedValue([])

    renderProjectRoute('suites/:suiteId', <SuitePage />, '/projects/project-1/suites/suite-1')

    expect(await screen.findByText('corr-suite-load')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload suite' }))
    expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument()
    expect(getSuite).toHaveBeenCalledTimes(2)
  })

  it('refetches failed case loading without reloading the suite', async () => {
    vi.spyOn(projectsApi, 'getSuite').mockResolvedValue(suite)
    const cases = vi.spyOn(projectsApi, 'cases')
      .mockRejectedValueOnce(new ApiError(503, 'Cases unavailable', { correlationId: 'corr-case-list' }))
      .mockResolvedValue([])

    renderProjectRoute('suites/:suiteId', <SuitePage />, '/projects/project-1/suites/suite-1')

    expect(await screen.findByText('corr-case-list')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload test cases' }))
    expect(await screen.findByRole('heading', { name: 'No cases yet' })).toBeInTheDocument()
    expect(cases).toHaveBeenCalledTimes(2)
  })

  it('retries a failed move to Trash from the lifecycle dialog', async () => {
    vi.spyOn(projectsApi, 'getSuite').mockResolvedValue(suite)
    vi.spyOn(projectsApi, 'cases').mockResolvedValue([])
    const archive = vi.spyOn(projectsApi, 'archiveSuite')
      .mockRejectedValueOnce(new ApiError(503, 'Archive unavailable', { correlationId: 'corr-suite-archive' }))
      .mockResolvedValue({ ...suite, status: 'ARCHIVED', version: 3 })

    renderProjectRoute('suites/:suiteId', <SuitePage />, '/projects/project-1/suites/suite-1', true)

    fireEvent.click(await screen.findByRole('button', { name: 'Move to trash' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Move Checkout to Trash?' })).getByRole('button', { name: 'Move to trash' }))
    expect(await screen.findByText('corr-suite-archive')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry move to trash' }))

    await waitFor(() => expect(archive).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Trash page')).toBeInTheDocument()
  })

  it.each([
    {
      code: 'execution_worker_disabled', status: 503, title: 'Execution worker is disabled.',
      recovery: 'Ask a platform administrator to enable the execution worker', retryable: true,
    },
    {
      code: 'execution_queue_full', status: 429, title: 'Execution queue is full.',
      recovery: 'Wait for an active run to finish or be cancelled', retryable: true,
    },
    {
      code: 'no_ready_cases', status: 400, title: 'No READY cases are available.',
      recovery: 'save at least one case as READY', retryable: false,
    },
  ])('shows distinct $code guidance when a suite run cannot queue', async ({ code, status, title, recovery, retryable }) => {
    vi.spyOn(projectsApi, 'getSuite').mockResolvedValue(suite)
    vi.spyOn(projectsApi, 'cases').mockResolvedValue([])
    vi.spyOn(projectsApi, 'queueSuite').mockRejectedValue(new ApiError(status, `Server rejected ${code}`, { code, correlationId: `corr-${code}` }))

    renderProjectRoute('suites/:suiteId', <SuitePage />, '/projects/project-1/suites/suite-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Run ready cases' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(title)
    expect(alert).toHaveTextContent(recovery)
    expect(alert).toHaveTextContent(`corr-${code}`)
    if (retryable) expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    else expect(within(alert).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })
})

function renderProjectRoute(childPath: string, element: ReactNode, initialEntry = `/projects/${project.id}/suites`, includeTrash = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}><Routes><Route path="/projects/:projectId" element={<Outlet context={{ project, root: `/projects/${project.id}` }} />}><Route path={childPath} element={element} />{includeTrash && <Route path="trash" element={<p>Trash page</p>} />}</Route></Routes></MemoryRouter></QueryClientProvider>)
}
