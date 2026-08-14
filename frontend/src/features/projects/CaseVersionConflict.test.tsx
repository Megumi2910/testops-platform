import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CaseVersionConflict } from './CaseVersionConflict'
import { caseConflictRows, type CaseConflictDraft } from './caseConflict'
import type { TestCase } from './api'

const local: CaseConflictDraft = {
  name: 'Local name', description: 'Local description', status: 'READY', priority: 'HIGH', tags: 'P0, smoke',
  retryCount: 2, dataIsolation: true, steps: [{ position: 0, action: 'NAVIGATE', inputValue: '/' }],
}
const server: TestCase = {
  id: 'case-1', suiteId: 'suite-1', name: 'Server name', description: 'Server description', status: 'DRAFT',
  priority: 'MEDIUM', tags: 'P1', retryCount: 0, dataIsolation: false, version: 7,
  steps: [{ position: 0, action: 'NAVIGATE', inputValue: '/' }, { position: 1, action: 'ASSERT_VISIBLE' }],
}

describe('case version conflict', () => {
  it('reports only visible differences without exposing step values', () => {
    const rows = caseConflictRows(local, server)
    expect(rows.map(row => row.label)).toEqual(['Name', 'Description', 'Status', 'Priority', 'Tags', 'Retry count', 'Data isolation', 'Step actions'])
    expect(JSON.stringify(rows)).not.toContain('inputValue')
  })

  it('focuses the comparison and requires an explicit recovery choice', () => {
    const reload = vi.fn()
    const retry = vi.fn()
    render(<CaseVersionConflict local={local} server={server} onReload={reload} onRetry={retry} />)
    expect(screen.getByRole('region', { name: 'Compare your unsaved version with server version 7, then choose which one to keep.' })).toHaveFocus()
    expect(screen.getByRole('table')).toHaveTextContent('Local name')
    fireEvent.click(screen.getByRole('button', { name: 'Reload server version' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry my changes' }))
    expect(reload).toHaveBeenCalledOnce()
    expect(retry).toHaveBeenCalledOnce()
  })
})
