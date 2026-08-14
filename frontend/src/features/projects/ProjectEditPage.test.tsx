import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../lib/api'
import { projectsApi, type Project } from './api'
import { EditProjectPage } from './ProjectPages'

const project: Project = {
  id: 'project-1', name: 'Storefront', description: 'Original description', targetOrigin: 'http://localhost:3201', status: 'ACTIVE', version: 4,
  createdAt: '2026-08-13T00:00:00Z', updatedAt: '2026-08-13T00:00:00Z', currentUserProjectRole: 'PROJECT_MANAGER',
  permissions: ['PROJECT_VIEW', 'PROJECT_UPDATE'], onboarding: { suiteCount: 0, caseCount: 0, readyCaseCount: 0, executionCount: 0 },
}

afterEach(() => vi.restoreAllMocks())

describe('EditProjectPage', () => {
  it('saves the current version and returns to the project', async () => {
    const update = vi.spyOn(projectsApi, 'update').mockResolvedValue({ ...project, name: 'Updated storefront', version: 5 })
    renderPage(project)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated storefront' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith(project.id, {
      name: 'Updated storefront', description: 'Original description', targetOrigin: project.targetOrigin, projectVersion: 4,
    }))
    await waitFor(() => expect(screen.getByText('Project outlet')).toBeInTheDocument())
  })

  it('maps duplicate names to an inline conflict instead of a generic failure', async () => {
    vi.spyOn(projectsApi, 'update').mockRejectedValue(new ApiError(409, 'Project name is already in use', { code: 'project_name_taken' }))
    renderPage(project)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Existing project' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('An active project already uses this name.')
  })

  it('keeps archived projects read-only', () => {
    renderPage({ ...project, status: 'ARCHIVED' })
    expect(screen.getByRole('heading', { name: 'Project editing is unavailable' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })
})

function renderPage(contextProject: Project) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/projects/${contextProject.id}/edit`]}><Routes><Route path="/projects/:projectId" element={<Outlet context={{ project: contextProject, root: `/projects/${contextProject.id}` }} />}><Route path="edit" element={<EditProjectPage />} /><Route index element={<div>Project outlet</div>} /></Route></Routes></MemoryRouter></QueryClientProvider>)
}
