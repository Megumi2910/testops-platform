import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../lib/api'
import { projectsApi, type Member, type Project } from './api'
import { MembersPage } from './ProjectResourcePages'

const project: Project = {
  id: 'project-1', name: 'QA project', targetOrigin: 'http://localhost:3001', status: 'ACTIVE', version: 7,
  createdAt: '2026-08-11T00:00:00Z', updatedAt: '2026-08-11T00:00:00Z', currentUserProjectRole: 'PROJECT_MANAGER',
  permissions: ['PROJECT_VIEW', 'MEMBER_MANAGE'], onboarding: { suiteCount: 0, caseCount: 0, readyCaseCount: 0, executionCount: 0 },
}
const members: Member[] = [
  { userId: 'manager-1', email: 'manager@example.test', displayName: 'Project manager', role: 'PROJECT_MANAGER', version: 0 },
  { userId: 'tester-1', email: 'tester@example.test', displayName: 'QA tester', role: 'TESTER', version: 0 },
]

afterEach(() => vi.restoreAllMocks())

describe('MembersPage', () => {
  it('updates a member role with the current project version', async () => {
    vi.spyOn(projectsApi, 'members').mockResolvedValue(members)
    const update = vi.spyOn(projectsApi, 'updateMember').mockResolvedValue({ ...members[1], role: 'VIEWER' })
    renderMembers(project)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Role for QA tester' }), { target: { value: 'VIEWER' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save role' })[1])

    await waitFor(() => expect(update).toHaveBeenCalledWith(project.id, 'tester-1', { role: 'VIEWER', projectVersion: 7 }))
  })

  it('confirms removal and explains the final-manager conflict', async () => {
    vi.spyOn(projectsApi, 'members').mockResolvedValue(members)
    vi.spyOn(projectsApi, 'removeMember').mockRejectedValue(new ApiError(409, 'A project must always have a project manager', { code: 'final_project_manager' }))
    renderMembers(project)

    fireEvent.click((await screen.findAllByRole('button', { name: 'Remove' }))[0])
    expect(screen.getByRole('dialog', { name: 'Remove Project manager?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove member' }))

    expect(await screen.findByText('Assign another project manager before changing or removing the final project manager.')).toBeInTheDocument()
  })

  it('renders existing roles without mutation controls for read-only access', async () => {
    vi.spyOn(projectsApi, 'members').mockResolvedValue(members)
    renderMembers({ ...project, currentUserProjectRole: 'VIEWER', permissions: ['PROJECT_VIEW'] })

    expect(await screen.findByText('PROJECT_MANAGER')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save role' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('offers a retry when the member list request fails', async () => {
    const membersRequest = vi.spyOn(projectsApi, 'members')
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(members)
    renderMembers(project)

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load members.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(screen.getByText('QA tester')).toBeInTheDocument())
    expect(membersRequest).toHaveBeenCalledTimes(2)
  })

  it('refreshes membership data after a stale-version mutation failure', async () => {
    const membersRequest = vi.spyOn(projectsApi, 'members')
      .mockResolvedValueOnce(members)
      .mockResolvedValueOnce(members)
    vi.spyOn(projectsApi, 'updateMember').mockRejectedValue(
      new ApiError(409, 'The project changed', { code: 'stale_version' }),
    )
    renderMembers(project)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Role for QA tester' }), { target: { value: 'VIEWER' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save role' })[1])

    expect(await screen.findByText('The project changed. Reloaded data is required before trying again.')).toBeInTheDocument()
    await waitFor(() => expect(membersRequest).toHaveBeenCalledTimes(2))
  })
})

function renderMembers(contextProject: Project) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/projects/${contextProject.id}/members`]}><Routes><Route path="/projects/:projectId" element={<Outlet context={{ project: contextProject, root: `/projects/${contextProject.id}` }} />}><Route path="members" element={<MembersPage />} /></Route></Routes></MemoryRouter></QueryClientProvider>)
}
