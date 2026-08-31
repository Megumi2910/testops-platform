import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../lib/api'
import { projectsApi, type Execution, type ExecutionQueued, type Project } from '../projects/api'
import { ExecutionDetailPage, ExecutionsPage } from './ExecutionPages'
import { executionDetailRefetchInterval } from './executionGuidance'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const execution = (overrides: Partial<Execution> = {}): Execution => ({
  id: 'execution-1',
  projectId: 'project-1',
  status: 'PASSED',
  canCancel: false,
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
  it('polls only known active executions and never loops an empty or failed detail query', () => {
    expect(executionDetailRefetchInterval()).toBe(false)
    expect(executionDetailRefetchInterval({ status: 'ERROR' })).toBe(false)
    expect(executionDetailRefetchInterval({ status: 'QUEUED' })).toBe(2000)
  })

  it('offers a permission-aware action to run the current suite again', async () => {
    const detail = execution({ status: 'FAILED', suiteId: 'suite-1' })
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(detail)
    let resolveQueue: (value: ExecutionQueued) => void = () => undefined
    const queue = vi.spyOn(projectsApi, 'queueSuite').mockReturnValue(new Promise(resolve => { resolveQueue = resolve }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    const rerun = await screen.findByRole('button', { name: 'Run suite again' })
    fireEvent.click(rerun)

    await waitFor(() => expect(queue).toHaveBeenCalledWith('project-1', 'suite-1'))
    expect(rerun).toBeDisabled()
    resolveQueue({ executionId: 'execution-2', status: 'QUEUED', canCancel: true })
  })

  it('hides the suite rerun action when execution permission is absent', async () => {
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(execution({ suiteId: 'suite-1' }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />, project([]))

    await screen.findByRole('heading', { name: 'PASSED' })
    expect(screen.queryByRole('button', { name: 'Run suite again' })).not.toBeInTheDocument()
  })

  it('does not offer a second suite run while the current execution is active', async () => {
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(execution({ status: 'RUNNING', suiteId: 'suite-1' }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    await screen.findByRole('heading', { name: 'RUNNING' })
    expect(screen.queryByRole('button', { name: 'Run suite again' })).not.toBeInTheDocument()
  })

  it.each([
    { canCancel: true, expected: true },
    { canCancel: false, expected: false },
  ])('uses server-computed canCancel=$canCancel without deriving requester authorization', async ({ canCancel, expected }) => {
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(execution({ status: 'QUEUED', canCancel }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />, project([]))

    await screen.findByRole('heading', { name: 'QUEUED' })
    if (expected) expect(screen.getByRole('button', { name: 'Cancel run' })).toBeInTheDocument()
    else expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument()
  })

  it('explains queue saturation when a permitted suite rerun is rejected', async () => {
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(execution({ status: 'FAILED', suiteId: 'suite-1' }))
    vi.spyOn(projectsApi, 'queueSuite').mockRejectedValue(new api.ApiError(429, 'The execution queue is full', { code: 'execution_queue_full', correlationId: 'corr-queue-full' }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Run suite again' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Execution queue is full.')
    expect(alert).toHaveTextContent('Wait for an active run to finish or be cancelled')
    expect(alert).toHaveTextContent('corr-queue-full')
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
    const detail = execution({ artifacts: [{ id: 'artifact-1', type: 'SCREENSHOT', contentType: 'image/png', byteSize: 1024, sha256: 'hash', secretSuppressed: false, createdAt: '2026-08-15T10:00:01Z', stepPosition: 0, downloadFilename: 'checkout-homepage-execution-screenshot.png' }] })
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(detail)
    const artifact = vi.spyOn(api, 'apiBlobFetch').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Blob(['image'], { type: 'image/png' }))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:execution-preview'), revokeObjectURL: vi.fn() })
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    const previewButton = await screen.findByRole('button', { name: 'Preview screenshot' })
    previewButton.focus()
    fireEvent.click(previewButton)
    expect(await screen.findByRole('alert')).toHaveTextContent('The artifact could not be loaded.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    const preview = await screen.findByRole('dialog', { name: 'Screenshot · step 1' })
    expect(preview).toBeVisible()
    expect(screen.getByRole('button', { name: 'Close preview' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Close preview' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(previewButton).toHaveFocus()
    await waitFor(() => expect(artifact).toHaveBeenCalledTimes(2))
    expect(artifact).toHaveBeenLastCalledWith('/api/v1/projects/project-1/executions/execution-1/artifacts/artifact-1')
  })

  it('shows category-specific recovery guidance for infrastructure failures', async () => {
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(execution({
      status: 'ERROR',
      infrastructureErrorCategory: 'TARGET_UNREACHABLE',
      errorMessage: 'Connection refused',
      cases: [],
    }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Target unreachable')
    expect(screen.getByText(/Start the target, verify its port and target check/)).toBeInTheDocument()
    expect(screen.getByText('Category: TARGET_UNREACHABLE')).toBeInTheDocument()
  })

  it('renders immutable run snapshots and lifecycle times', async () => {
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(execution({
      suiteNameSnapshot: 'Checkout smoke',
      targetOriginSnapshot: 'https://storefront.example.test',
      browser: 'chromium',
      startedAt: '2026-08-15T10:00:01Z',
      finishedAt: '2026-08-15T10:00:05Z',
    }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    const details = (await screen.findByRole('heading', { name: 'Run details' })).closest('section')
    expect(details).not.toBeNull()
    expect(within(details!).getByText('Checkout smoke')).toBeInTheDocument()
    expect(within(details!).getByText('https://storefront.example.test')).toBeInTheDocument()
    expect(within(details!).getByText('chromium')).toBeInTheDocument()
    expect(within(details!).getByText('Queued')).toBeInTheDocument()
    expect(within(details!).getByText('Started')).toBeInTheDocument()
    expect(within(details!).getByText('Finished')).toBeInTheDocument()
  })

  it('uses the server-provided safe filename when downloading a trace', async () => {
    const filename = 'checkout-homepage-a1b2c3d4-step-1-trace.zip'
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(execution({ artifacts: [{
      id: 'trace-1', type: 'TRACE', contentType: 'application/zip', byteSize: 2048, sha256: 'hash', secretSuppressed: false,
      createdAt: '2026-08-15T10:00:01Z', stepPosition: 0, downloadFilename: filename,
    }] }))
    vi.spyOn(api, 'apiBlobFetch').mockResolvedValue(new Blob(['trace'], { type: 'application/zip' }))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:execution-trace'), revokeObjectURL: vi.fn() })
    let downloadedFilename = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloadedFilename = this.download })
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    expect(await screen.findByText(filename)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Download trace' }))

    await waitFor(() => expect(downloadedFilename).toBe(filename))
  })

  it('renders suppression and purge reasons without artifact actions', async () => {
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(execution({
      cases: [{
        id: 'case-result-1', caseId: 'case-1', caseName: 'Checkout with secret', status: 'PASSED', attemptCount: 1,
        evidenceSuppressed: true, evidenceSuppressionReason: 'SECRET_VARIABLE_USED', steps: [],
      }],
      artifacts: [
        { id: 'screenshot-1', caseResultId: 'case-result-1', type: 'SCREENSHOT', contentType: 'image/png', byteSize: 0, sha256: 'hash', secretSuppressed: true, createdAt: '2026-08-15T10:00:01Z', downloadFilename: 'suppressed.png' },
        { id: 'trace-1', type: 'TRACE', contentType: 'application/zip', byteSize: 2048, sha256: 'hash', secretSuppressed: false, createdAt: '2026-07-01T10:00:01Z', purgedAt: '2026-08-15T10:00:01Z', purgeReason: 'RETENTION_POLICY', downloadFilename: 'checkout-trace.zip' },
      ],
    }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    await screen.findByRole('heading', { name: 'Artifacts' })
    expect(screen.getAllByText(/SECRET_VARIABLE_USED/).length).toBeGreaterThan(0)
    expect(screen.getByText(/RETENTION_POLICY/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preview screenshot' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download trace' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Unavailable')).toHaveLength(2)
  })

  it('does not repeat an execution category in every matching case result', async () => {
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(execution({
      status: 'ERROR',
      infrastructureErrorCategory: 'TARGET_UNREACHABLE',
      cases: [{
        id: 'case-result-1',
        caseId: 'case-1',
        caseName: 'Homepage smoke',
        status: 'ERROR',
        attemptCount: 2,
        errorCategory: 'TARGET_UNREACHABLE',
        errorMessage: 'Connection refused',
        evidenceSuppressed: false,
        steps: [],
      }],
      errorCases: 1,
    }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    await screen.findByRole('heading', { name: 'Homepage smoke' })
    expect(screen.getAllByText('Category: TARGET_UNREACHABLE')).toHaveLength(1)
    expect(screen.getAllByText('Target unreachable.')).toHaveLength(2)
  })

  it('shows case-level assertion recovery without exposing a generic worker message', async () => {
    vi.spyOn(projectsApi, 'execution').mockResolvedValue(execution({
      status: 'FAILED',
      cases: [{
        id: 'case-result-1',
        caseId: 'case-1',
        caseName: 'Homepage smoke',
        status: 'FAILED',
        attemptCount: 1,
        errorCategory: 'ASSERTION_FAILURE',
        errorMessage: 'Expected text was not visible',
        failedStepPosition: 1,
        evidenceSuppressed: false,
        steps: [
          { position: 0, action: 'NAVIGATE', status: 'PASSED', durationMs: 30 },
          { position: 1, action: 'ASSERT_VISIBLE', status: 'FAILED', durationMs: 12, errorMessage: 'Expected text was not visible' },
        ],
      }],
      failedCases: 1,
    }))
    renderPage('/projects/project-1/executions/execution-1', <ExecutionDetailPage />)

    expect(await screen.findByRole('heading', { name: 'Homepage smoke' })).toBeInTheDocument()
    expect(screen.getByText('Assertion failed.')).toBeInTheDocument()
    expect(screen.getByText(/Check the expected value and confirm the target data/)).toBeInTheDocument()
    expect(screen.getByText('Category: ASSERTION_FAILURE')).toBeInTheDocument()
    expect(screen.getByText('2. ASSERT_VISIBLE')).toBeInTheDocument()
  })
})
