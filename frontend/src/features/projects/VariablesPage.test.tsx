import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../lib/api'
import { platformApi, projectsApi, type PlatformOptions, type Project } from './api'
import { VariablesPage } from './ProjectResourcePages'

const baseProject: Project = {
  id: 'project-1', name: 'QA project', targetOrigin: 'http://localhost:3001', status: 'ACTIVE', version: 7,
  createdAt: '2026-08-11T00:00:00Z', updatedAt: '2026-08-11T00:00:00Z', currentUserProjectRole: 'PROJECT_MANAGER',
  permissions: ['PROJECT_VIEW', 'VARIABLE_VIEW', 'VARIABLE_MANAGE'], onboarding: { suiteCount: 0, caseCount: 0, readyCaseCount: 0, executionCount: 0 },
}
const platformOptions: PlatformOptions = {
  targetAllowedOrigins: [], targetConfigured: true, projectCreationEnabled: true, reportingAvailable: true,
  secretVariablesEnabled: true, executionWorkerEnabled: true, supportedStepActions: [], supportedLocatorTypes: [],
}

beforeEach(() => {
  vi.spyOn(platformApi, 'options').mockResolvedValue(platformOptions)
})
afterEach(() => vi.restoreAllMocks())

describe('VariablesPage', () => {
  it('does not request variables for a direct link without VARIABLE_VIEW', () => {
    const variables = vi.spyOn(projectsApi, 'variables')
    renderVariables({ ...baseProject, currentUserProjectRole: 'VIEWER', permissions: ['PROJECT_VIEW'] })

    expect(screen.getByRole('alert')).toHaveTextContent('Variables are restricted.')
    expect(screen.getByRole('link', { name: 'Back to project overview' })).toHaveAttribute('href', '/projects/project-1')
    expect(variables).not.toHaveBeenCalled()
    expect(platformApi.options).not.toHaveBeenCalled()
  })

  it('keeps secret values masked in the project workspace', async () => {
    vi.spyOn(projectsApi, 'variables').mockResolvedValue([{ key: 'PASSWORD', secret: true, version: 1 }])
    renderVariables(baseProject)

    expect(await screen.findByText('PASSWORD')).toBeInTheDocument()
    expect(screen.getByText('••••••••')).toBeInTheDocument()
    expect(screen.queryByText('super-secret')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Variable key' })).toHaveAttribute('autocomplete', 'off')
    expect(screen.getByRole('textbox', { name: 'Variable value' })).toHaveAttribute('autocomplete', 'off')
  })

  it('creates a variable with the current project version', async () => {
    vi.spyOn(projectsApi, 'variables').mockResolvedValue([])
    const create = vi.spyOn(projectsApi, 'createVariable').mockResolvedValue({ key: 'BASE_URL', secret: false, value: 'https://example.test', version: 0 })
    renderVariables(baseProject)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Variable key' }), { target: { value: 'BASE_URL' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Variable value' }), { target: { value: 'https://example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save variable' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith('project-1', {
      key: 'BASE_URL', secret: false, value: 'https://example.test', projectVersion: 7,
    }))
  })

  it('edits a variable with immutable classification and both concurrency versions', async () => {
    vi.spyOn(projectsApi, 'variables').mockResolvedValue([{ key: 'BASE_URL', secret: false, value: 'https://old.test', version: 3 }])
    const update = vi.spyOn(projectsApi, 'updateVariable').mockResolvedValue({ key: 'BASE_URL', secret: false, value: 'https://new.test', version: 4 })
    renderVariables(baseProject)

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('textbox', { name: 'Editing variable key' })).toHaveValue('BASE_URL')
    expect(screen.getByRole('textbox', { name: 'Editing variable key' })).toHaveAttribute('readonly')
    fireEvent.change(screen.getByRole('textbox', { name: 'New value for BASE_URL' }), { target: { value: 'https://new.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith('project-1', 'BASE_URL', {
      key: 'BASE_URL', secret: false, value: 'https://new.test', projectVersion: 7, variableVersion: 3,
    }))
  })

  it('replaces a secret without reading or changing its classification', async () => {
    vi.spyOn(projectsApi, 'variables').mockResolvedValue([{ key: 'PASSWORD', secret: true, version: 5 }])
    const update = vi.spyOn(projectsApi, 'updateVariable').mockResolvedValue({ key: 'PASSWORD', secret: true, version: 6 })
    renderVariables(baseProject)

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const replacement = screen.getByLabelText('New value for PASSWORD')
    expect(replacement).toHaveAttribute('type', 'password')
    expect(replacement).toHaveValue('')
    expect(screen.getByText(/secret classification cannot be changed/i)).toBeInTheDocument()
    fireEvent.change(replacement, { target: { value: 'replacement-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith('project-1', 'PASSWORD', {
      key: 'PASSWORD', secret: true, value: 'replacement-secret', projectVersion: 7, variableVersion: 5,
    }))
    expect(screen.queryByText('replacement-secret')).not.toBeInTheDocument()
  })

  it('disables secret creation and editing when server-side secret storage is disabled', async () => {
    vi.mocked(platformApi.options).mockResolvedValue({ ...platformOptions, secretVariablesEnabled: false })
    vi.spyOn(projectsApi, 'variables').mockResolvedValue([{ key: 'PASSWORD', secret: true, version: 1 }])
    renderVariables(baseProject)

    expect(await screen.findByText('Secret variables are unavailable.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Secret' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByText('••••••••')).toBeInTheDocument()
  })

  it('keeps a reference conflict and its correlation id inside the delete confirmation', async () => {
    vi.spyOn(projectsApi, 'variables').mockResolvedValue([{ key: 'BASE_URL', secret: false, value: 'https://example.test', version: 3 }])
    const remove = vi.spyOn(projectsApi, 'deleteVariable').mockRejectedValue(new ApiError(409, 'Variable is referenced', {
      code: 'variable_in_use', correlationId: 'corr-variable-42',
    }))
    renderVariables(baseProject)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove variable' }))

    await waitFor(() => expect(remove).toHaveBeenCalledWith('project-1', 'BASE_URL', 7, 3))
    const dialog = screen.getByRole('dialog', { name: 'Remove BASE_URL?' })
    expect(dialog).toHaveTextContent('Variable is still in use.')
    expect(dialog).toHaveTextContent('corr-variable-42')
    expect(screen.getByRole('link', { name: 'Review suites' })).toHaveAttribute('href', '/projects/project-1/suites')
  })

  it('reloads a stale variable and retries deletion with its latest version', async () => {
    const variables = vi.spyOn(projectsApi, 'variables')
      .mockResolvedValueOnce([{ key: 'BASE_URL', secret: false, value: 'old', version: 3 }])
      .mockResolvedValueOnce([{ key: 'BASE_URL', secret: false, value: 'latest', version: 4 }])
      .mockResolvedValue([])
    const remove = vi.spyOn(projectsApi, 'deleteVariable')
      .mockRejectedValueOnce(new ApiError(409, 'Variable changed', { code: 'stale_version' }))
      .mockResolvedValueOnce()
    renderVariables(baseProject)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove variable' }))
    expect(await screen.findByText(/latest data was reloaded/i)).toBeInTheDocument()
    await waitFor(() => expect(variables).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Remove variable' }))
    await waitFor(() => expect(remove).toHaveBeenNthCalledWith(2, 'project-1', 'BASE_URL', 7, 4))
  })

  it('maps server field errors and exposes a safe correlation reference', async () => {
    vi.spyOn(projectsApi, 'variables').mockResolvedValue([])
    vi.spyOn(projectsApi, 'createVariable').mockRejectedValue(new ApiError(400, 'Variable is invalid', {
      correlationId: 'corr-create-variable', errors: { key: 'This key is reserved.' },
    }))
    renderVariables(baseProject)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Variable key' }), { target: { value: 'RESERVED' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Variable value' }), { target: { value: 'value' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save variable' }))

    expect(await screen.findByText('This key is reserved.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Variable key' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('corr-create-variable')).toBeInTheDocument()
  })
})

function renderVariables(project: Project) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/projects/${project.id}/variables`]}><Routes><Route path="/projects/:projectId" element={<Outlet context={{ project, root: `/projects/${project.id}` }} />}><Route path="variables" element={<VariablesPage />} /></Route></Routes></MemoryRouter></QueryClientProvider>)
}
