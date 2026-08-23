import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { ApiError } from '../../lib/api'
import { AuthContext, type AuthContextValue } from '../auth/AuthContext'
import type { UserSummary } from '../auth/api'
import { platformApi, projectsApi, type Project } from './api'
import { NewProjectPage, ProjectsPage } from './ProjectPages'
import { ProjectLayout } from './ProjectWorkspace'

const user: UserSummary = {
  id: 'user-1', email: 'tester@example.test', displayName: 'Tester', emailVerified: true, status: 'ACTIVE',
  platformRole: 'MEMBER', loginMethods: ['PASSWORD'], platformPermissions: [],
}

const project: Project = {
  id: 'project-1', name: 'Storefront', targetOrigin: 'http://localhost:3201', status: 'ACTIVE', version: 4,
  createdAt: '2026-08-13T00:00:00Z', updatedAt: '2026-08-13T00:00:00Z', currentUserProjectRole: 'PROJECT_MANAGER',
  permissions: ['PROJECT_VIEW', 'PROJECT_UPDATE', 'PROJECT_ARCHIVE'], onboarding: { suiteCount: 0, caseCount: 0, readyCaseCount: 0, executionCount: 0 },
}

const options = {
  targetAllowedOrigins: ['http://localhost:3201'], targetConfigured: true, projectCreationEnabled: true, reportingAvailable: true,
  secretVariablesEnabled: true, executionWorkerEnabled: true, supportedStepActions: [], supportedLocatorTypes: [], stepActions: [],
}

afterEach(() => vi.restoreAllMocks())

describe('project recovery surfaces', () => {
  it('shows a correlation reference and refetches a failed project list', async () => {
    const list = vi.spyOn(projectsApi, 'list')
      .mockRejectedValueOnce(new ApiError(503, 'Projects unavailable', { correlationId: 'corr-project-list' }))
      .mockResolvedValue({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0 })
    vi.spyOn(platformApi, 'options').mockResolvedValue(options)

    renderWithClient(<AuthContext.Provider value={authContext()}><MemoryRouter><ProjectsPage /></MemoryRouter></AuthContext.Provider>)

    expect(await screen.findByText('corr-project-list')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'No projects yet' })).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('recovers project setup and keeps the project name autocomplete disabled', async () => {
    const setup = vi.spyOn(platformApi, 'options')
      .mockRejectedValueOnce(new ApiError(503, 'Setup unavailable', { correlationId: 'corr-project-setup' }))
      .mockResolvedValue(options)

    renderWithClient(<MemoryRouter><NewProjectPage /></MemoryRouter>)

    expect(await screen.findByText('corr-project-setup')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    const name = await screen.findByRole('textbox', { name: 'Name' })
    expect(name).toHaveAttribute('autocomplete', 'off')
    expect(setup).toHaveBeenCalledTimes(2)
  })

  it('revalidates project creation before retrying a failed request', async () => {
    vi.spyOn(platformApi, 'options').mockResolvedValue(options)
    const create = vi.spyOn(projectsApi, 'create').mockRejectedValue(new ApiError(503, 'Create unavailable'))

    renderWithClient(<MemoryRouter><NewProjectPage /></MemoryRouter>)

    const name = await screen.findByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: 'QA project' } })
    fireEvent.change(screen.getByRole('combobox', { name: /^Target origin/ }), { target: { value: 'http://localhost:3201' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Create unavailable')

    fireEvent.change(name, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(name).toHaveAttribute('aria-invalid', 'true')
  })

  it('refetches a failed project workspace load', async () => {
    const get = vi.spyOn(projectsApi, 'get')
      .mockRejectedValueOnce(new ApiError(503, 'Project unavailable', { correlationId: 'corr-project-load' }))
      .mockResolvedValue(project)

    renderProjectLayout()

    expect(await screen.findByText('corr-project-load')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload project' }))
    expect(await screen.findByRole('heading', { name: 'Storefront' })).toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('keeps a failed archive recoverable inside the confirmation dialog', async () => {
    vi.spyOn(projectsApi, 'get').mockResolvedValueOnce(project).mockResolvedValue({ ...project, status: 'ARCHIVED', version: 5 })
    const archive = vi.spyOn(projectsApi, 'archive')
      .mockRejectedValueOnce(new ApiError(503, 'Archive unavailable', { correlationId: 'corr-project-archive' }))
      .mockResolvedValue({ ...project, status: 'ARCHIVED', version: 5 })

    renderProjectLayout()

    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive project' }))
    expect(await screen.findByText('corr-project-archive')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry archive' }))

    await waitFor(() => expect(archive).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Restore project' })).toBeInTheDocument()
  })
})

function authContext(): AuthContextValue {
  return {
    user, providers: { enabled: true, registrationEnabled: true, emailVerificationEnabled: true, googleEnabled: false }, loading: false,
    reloadUser: vi.fn(async () => user), login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendEmail: vi.fn(), resendAuthenticatedEmail: vi.fn(), logout: vi.fn(),
  }
}

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function renderProjectLayout() {
  return renderWithClient(<MemoryRouter initialEntries={['/projects/project-1']}><Routes><Route path="/projects/:projectId" element={<ProjectLayout />}><Route index element={<p>Project overview</p>} /></Route></Routes></MemoryRouter>)
}
