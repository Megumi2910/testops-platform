import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../lib/api'
import { projectsApi, type Execution, type Project } from '../projects/api'
import { ExecutionDetailPage, ExecutionsPage } from './ExecutionPages'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const execution = (overrides: Partial<Execution> = {}): Execution => ({
  id: 'execution-1',
  projectId: 'project-1',
  status: 'PASSED',
  totalCases: 0,
  completedCases: 0,
  passedCases: 0,
  failedCases: 0,
  errorCases: 0,
  cancelledCases: 0,
  createdAt: '2026-08-15T10:00:00Z',
  cases: [],
  artifacts: [],
  ...overrides,
})

const project = (permissions: Project['permissions'] = ['EXECUTION_START']): Project => ({
  id: 'project-1',
  name: 'QA project',
  targetOrigin: 'http://localhost:3001',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-08-15T10:00:00Z',
  updatedAt: '2026-08-15T10:00:00Z',
  permissions,
  onboarding: { suiteCount: 1, caseCount: 1, readyCaseCount: 1, executionCount: 1 },
})

function renderPage(path: string, page: ReactNode, projectData = project()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  vi.spyOn(projectsApi, 'get').mockResolvedValue(projectData)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/projects/:projectId/executions" element={page} /><Route path="/projects/:projectId/executions/:executionId" element={page} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('execution history recovery', () => {
  it('offers an in-place retry when the execution list cannot load', async () => {
    const list = vi.spyOn(projectsApi, 'executions').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    renderPage('/projects/project-1/executions', <ExecutionsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load executions.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Runs' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No runs yet' })).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })
})

describe('execution detail recovery', () => {
  it('offers a permission-aware action to run the current suite again', async () => {
    const detail = execution({ status: 'FAILED', suiteId: 'suite-1' })
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(detail)
    let resolveQueue: (value: { executionId: string; status: string }) => void = () => undefined
    const queue = vi.spyOn(projectsApi, 'queueSuite').mockReturnValue(new Promise(resolve => { resolveQueue = resolve }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    const rerun = await screen.findByRole('button', { name: 'Run current suite again' })
    fireEvent.click(rerun)

    await waitFor(() => expect(queue).toHaveBeenCalledWith('project-1', 'suite-1'))
    expect(rerun).toBeDisabled()
    resolveQueue({ executionId: 'execution-2', status: 'QUEUED' })
  })

  it('hides the suite rerun action when execution permission is absent', async () => {
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(execution({ suiteId: 'suite-1' }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />, project([]))

    await screen.findByRole('heading', { name: 'PASSED' })
    expect(screen.queryByRole('button', { name: 'Run current suite again' })).not.toBeInTheDocument()
  })

  it('offers an in-place retry when the execution detail cannot load', async () => {
    const detail = vi.spyOn(projectsApi, 'execution').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(execution())
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load this execution.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'PASSED' })).toBeInTheDocument()
    expect(detail).toHaveBeenCalledTimes(2)
  })

  it('explains artifact failures and retries the same artifact request', async () => {
    const detail = execution({ artifacts: [{ id: 'artifact-1', type: 'SCREENSHOT', contentType: 'image/png', byteSize: 1024, sha256: 'hash', secretSuppressed: false, createdAt: '2026-08-15T10:00:01Z', stepPosition: 0 }] })
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(detail)
    const artifact = vi.spyOn(api, 'apiBlobFetch').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Blob(['image'], { type: 'image/png' }))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:execution-preview'), revokeObjectURL: vi.fn() })
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    const previewButton = await screen.findByRole('button', { name: 'Preview screenshot' })
    previewButton.focus()
    fireEvent.click(previewButton)
    expect(await screen.findByRole('alert')).toHaveTextContent('The artifact could not be loaded.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    const preview = await screen.findByRole('dialog', { name: 'Screenshot execution-1' })
    expect(preview).toBeVisible()
    expect(screen.getByRole('button', { name: 'Close preview' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(previewButton).toHaveFocus()
    await waitFor(() => expect(artifact).toHaveBeenCalledTimes(2))
    expect(artifact).toHaveBeenLastCalledWith('/api/v1/projects/project-1/executions/execution-1/artifacts/artifact-1')
  })
})
