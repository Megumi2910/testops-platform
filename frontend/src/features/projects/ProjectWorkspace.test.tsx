import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { projectsApi, type Project } from './api'
import { ProjectLayout } from './ProjectWorkspace'

const viewerProject: Project = {
  id: 'project-1',
  name: 'QA project',
  targetOrigin: 'http://localhost:3001',
  status: 'ACTIVE',
  version: 7,
  createdAt: '2026-08-11T00:00:00Z',
  updatedAt: '2026-08-11T00:00:00Z',
  currentUserProjectRole: 'VIEWER',
  permissions: ['PROJECT_VIEW', 'DEFINITION_VIEW', 'EXECUTION_VIEW', 'ARTIFACT_VIEW'],
  targetHealth: { status: 'NOT_CHECKED' },
  onboarding: { suiteCount: 0, caseCount: 0, readyCaseCount: 0, executionCount: 0 },
}

afterEach(() => vi.restoreAllMocks())

describe('ProjectLayout', () => {
  it('keeps the read-only Members section discoverable to every project member', async () => {
    vi.spyOn(projectsApi, 'get').mockResolvedValue(viewerProject)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectLayout />}>
            <Route index element={<p>Project overview</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByRole('link', { name: 'Members' })).toHaveAttribute('href', '/projects/project-1/members')
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  })
})
