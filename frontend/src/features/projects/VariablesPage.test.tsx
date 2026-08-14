import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { projectsApi, type Project } from './api'
import { VariablesPage } from './ProjectResourcePages'

const baseProject: Project = {
  id: 'project-1', name: 'QA project', targetOrigin: 'http://localhost:3001', status: 'ACTIVE', version: 7,
  createdAt: '2026-08-11T00:00:00Z', updatedAt: '2026-08-11T00:00:00Z', currentUserProjectRole: 'PROJECT_MANAGER',
  permissions: ['PROJECT_VIEW', 'VARIABLE_VIEW', 'VARIABLE_MANAGE'], onboarding: { suiteCount: 0, caseCount: 0, readyCaseCount: 0, executionCount: 0 },
}

afterEach(() => vi.restoreAllMocks())

describe('VariablesPage', () => {
  it('does not request variables for a direct link without VARIABLE_VIEW', () => {
    const variables = vi.spyOn(projectsApi, 'variables')
    renderVariables({ ...baseProject, currentUserProjectRole: 'VIEWER', permissions: ['PROJECT_VIEW'] })

    expect(screen.getByRole('alert')).toHaveTextContent('Variables are restricted.')
    expect(screen.getByRole('link', { name: 'Back to project overview' })).toHaveAttribute('href', '/projects/project-1')
    expect(variables).not.toHaveBeenCalled()
  })

  it('keeps secret values masked in the project workspace', async () => {
    vi.spyOn(projectsApi, 'variables').mockResolvedValue([{ key: 'PASSWORD', secret: true, version: 1 }])
    renderVariables(baseProject)

    expect(await screen.findByText('PASSWORD')).toBeInTheDocument()
    expect(screen.getByText('••••••••')).toBeInTheDocument()
    expect(screen.queryByText('super-secret')).not.toBeInTheDocument()
  })
})

function renderVariables(project: Project) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/projects/${project.id}/variables`]}><Routes><Route path="/projects/:projectId" element={<Outlet context={{ project, root: `/projects/${project.id}` }} />}><Route path="variables" element={<VariablesPage />} /></Route></Routes></MemoryRouter></QueryClientProvider>)
}
