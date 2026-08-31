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

    expect(screen.getByLabelText('Name')).toHaveAttribute('autocomplete', 'off')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated storefront' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith(project.id, {
      name: 'Updated storefront', description: 'Original description', targetOrigin: project.targetOrigin, projectVersion: 4,
    }))
    await waitFor(() => expect(screen.getByText('Project outlet')).toBeInTheDocument())
  })

  it('maps duplicate names to an inline conflict and revalidates before retrying', async () => {
    const update = vi.spyOn(projectsApi, 'update').mockRejectedValue(new ApiError(409, 'Project name is already in use', { code: 'project_name_taken' }))
    renderPage(project)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Existing project' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('An active project already uses this name.')
    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Try save again' }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(name).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps archived projects read-only', () => {
    renderPage({ ...project, status: 'ARCHIVED' })
    expect(screen.getByRole('heading', { name: 'Project editing is unavailable' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('shows the correlation reference and reloads the latest project after a stale save', async () => {
    vi.spyOn(projectsApi, 'update').mockRejectedValue(new ApiError(409, 'Project changed', { code: 'stale_version', correlationId: 'corr-stale-42' }))
    const get = vi.spyOn(projectsApi, 'get').mockResolvedValue({ ...project, name: 'Latest storefront', version: 5 })
    renderPage(project)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Local edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('corr-stale-42')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest project' }))

    await waitFor(() => expect(get).toHaveBeenCalledWith(project.id))
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Latest storefront'))
    expect(screen.queryByText('corr-stale-42')).not.toBeInTheDocument()
  })

  it('disables editing and saving while the latest stale version is loading', async () => {
    const update = vi.spyOn(projectsApi, 'update').mockRejectedValue(new ApiError(409, 'Project changed', { code: 'stale_version' }))
    let resolveLatest!: (latest: Project) => void
    vi.spyOn(projectsApi, 'get').mockReturnValue(new Promise(resolve => { resolveLatest = resolve }))
    renderPage(project)

    const name = screen.getByLabelText('Name')
    const save = screen.getByRole('button', { name: 'Save changes' })
    fireEvent.change(name, { target: { value: 'Local edit' } })
    fireEvent.click(save)
    await waitFor(() => expect(save).toBeDisabled())
    fireEvent.click(await screen.findByRole('button', { name: 'Reload latest project' }))

    await waitFor(() => expect(name).toBeDisabled())
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(update).toHaveBeenCalledTimes(1)

    resolveLatest({ ...project, name: 'Latest storefront', version: 5 })
    await waitFor(() => expect(name).toHaveValue('Latest storefront'))
    expect(name).not.toBeDisabled()
    expect(save).not.toBeDisabled()
  })
})

function renderPage(contextProject: Project) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/projects/${contextProject.id}/edit`]}><Routes><Route path="/projects/:projectId" element={<Outlet context={{ project: contextProject, root: `/projects/${contextProject.id}` }} />}><Route path="edit" element={<EditProjectPage />} /><Route index element={<div>Project outlet</div>} /></Route></Routes></MemoryRouter></QueryClientProvider>)
}
