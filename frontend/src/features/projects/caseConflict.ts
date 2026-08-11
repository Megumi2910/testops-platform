import type { Step, TestCase } from './api'

export type CaseConflictDraft = {
  name: string
  description: string
  status: string
  priority: string
  tags: string
  retryCount: number
  dataIsolation: boolean
  steps: Step[]
}

export type ConflictRow = { label: string; local: string; server: string }

function text(value: string | undefined) { return value?.trim() || '—' }
function actions(steps: Step[]) { return steps.length ? steps.map(step => step.action).join(' → ') : 'No steps' }

export function caseConflictRows(local: CaseConflictDraft, server: TestCase): ConflictRow[] {
  const candidates: ConflictRow[] = [
    { label: 'Name', local: text(local.name), server: text(server.name) },
    { label: 'Description', local: text(local.description), server: text(server.description) },
    { label: 'Status', local: local.status, server: server.status },
    { label: 'Priority', local: local.priority, server: server.priority },
    { label: 'Tags', local: text(local.tags), server: text(server.tags) },
    { label: 'Retry count', local: String(local.retryCount), server: String(server.retryCount) },
    { label: 'Data isolation', local: local.dataIsolation ? 'Enabled' : 'Disabled', server: server.dataIsolation ? 'Enabled' : 'Disabled' },
    { label: 'Step actions', local: actions(local.steps), server: actions(server.steps) },
  ]
  return candidates.filter(row => row.local !== row.server)
}
