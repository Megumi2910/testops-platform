import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { projectsApi, type Project } from './api'
import { DefinitionTrashPage } from './DefinitionTrashPage'

const project: Project = {
  id: 'project-1', name: 'QA project', targetOrigin: 'http://localhost:3001', status: 'ACTIVE', version: 1,
  createdAt: '2026-08-09T00:00:00Z', updatedAt: '2026-08-09T00:00:00Z', currentUserProjectRole: 'PROJECT_MANAGER',
  permissions: ['DEFINITION_VIEW', 'DEFINITION_MANAGE'], onboarding: { suiteCount: 1, caseCount: 1, readyCaseCount: 0, executionCount: 0 },
}

afterEach(() => vi.restoreAllMocks())

describe('definition Trash page', () => {
  it('shows archived suites and cases with restore actions for managers', async () => {
    vi.spyOn(projectsApi, 'suites').mockResolvedValue([
      { id: 'suite-1', projectId: project.id, name: 'Archived suite', status: 'ARCHIVED', version: 2 },
      { id: 'suite-2', projectId: project.id, name: 'Active suite', status: 'ACTIVE', version: 1 },
    ])
    vi.spyOn(projectsApi, 'cases').mockImplementation(async (_projectId, suiteId) => suiteId === 'suite-2'
      ? [{ id: 'case-1', suiteId, name: 'Archived case', status: 'ARCHIVED', priority: 'MEDIUM', retryCount: 0, dataIsolation: true, version: 3, steps: [] }]
      : [])

    renderTrash(project)

    expect(await screen.findByRole('heading', { name: 'Suites' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Archived suite' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Archived case' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Restore' })).toHaveLength(2)
  })

  it('renders lifecycle data read-only without definition management', async () => {
    vi.spyOn(projectsApi, 'suites').mockResolvedValue([{ id: 'suite-1', projectId: project.id, name: 'Archived suite', status: 'ARCHIVED', version: 2 }])
    vi.spyOn(projectsApi, 'cases').mockResolvedValue([])

    renderTrash({ ...project, permissions: ['DEFINITION_VIEW'], currentUserProjectRole: 'VIEWER' })

    expect(await screen.findByText('Trash is read-only.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
  })
})

function renderTrash(contextProject: Project) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/projects/${contextProject.id}/trash`]}><Routes><Route path="/projects/:projectId" element={<Outlet context={{ project: contextProject, root: `/projects/${contextProject.id}` }} />}><Route path="trash" element={<DefinitionTrashPage />} /></Route></Routes></MemoryRouter></QueryClientProvider>)
}

