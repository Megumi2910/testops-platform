import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Alert, Button, Card, EmptyState, LoadingState, StatusBadge } from '../../components/ui'
import { projectKeys, projectsApi, type Suite, type TestCase } from './api'
import { RestoreDefinitionDialog } from './DefinitionLifecycle'
import { useProjectWorkspace } from './ProjectWorkspaceContext'

type TrashSelection =
  | { kind: 'suite'; suite: Suite }
  | { kind: 'case'; suite: Suite; testCase: TestCase }

export function DefinitionTrashPage() {
  const { projectId = '' } = useParams()
  const { project } = useProjectWorkspace()
  const client = useQueryClient()
  const [selection, setSelection] = useState<TrashSelection>()
  const [successMessage, setSuccessMessage] = useState<string>()
  const canRestore = project.permissions.includes('DEFINITION_MANAGE') && project.status === 'ACTIVE'
  const query = useQuery({
    queryKey: projectKeys.trash(projectId),
    queryFn: async () => {
      const suites = await projectsApi.suites(projectId, 'ALL')
      const archivedCases = (await Promise.all(suites.map(async suite => ({ suite, cases: await projectsApi.cases(projectId, suite.id, 'ARCHIVED') })))).flatMap(item => item.cases.map(testCase => ({ suite: item.suite, testCase })))
      return { suites: suites.filter(suite => suite.status === 'ARCHIVED'), cases: archivedCases }
    },
  })
  const restore = useMutation({
    mutationFn: async (name?: string) => {
      if (!selection) throw new Error('Choose a definition to restore.')
      if (selection.kind === 'suite') await projectsApi.restoreSuite(projectId, selection.suite.id, { version: selection.suite.version, name })
      else await projectsApi.restoreCase(projectId, selection.suite.id, selection.testCase.id, { version: selection.testCase.version, name })
    },
    onSuccess: () => {
      setSuccessMessage(`${selection?.kind === 'suite' ? 'Suite' : 'Case'} restored successfully.`)
      void client.invalidateQueries({ queryKey: projectKeys.trash(projectId) })
      void client.invalidateQueries({ queryKey: projectKeys.suites(projectId) })
      if (selection?.kind === 'case') void client.invalidateQueries({ queryKey: projectKeys.cases(projectId, selection.suite.id) })
      setSelection(undefined)
    },
  })

  if (query.isPending) return <Card><LoadingState label="Loading Trash…" /></Card>
  if (query.isError || !query.data) return <Alert tone="danger" title="Unable to load Trash.">Retry after the backend is ready.</Alert>
  const empty = query.data.suites.length === 0 && query.data.cases.length === 0

  return <section className="page-stack">
    <div className="page-heading compact"><div><p className="eyebrow">Lifecycle</p><h1>Trash</h1><p className="muted">Archived definitions keep their steps and execution history. Restored cases return as DRAFT.</p></div></div>
    {!canRestore && !empty && <Alert tone="warning" title="Trash is read-only.">A project or test manager can restore definitions when this project is active.</Alert>}
    {successMessage && <Alert tone="success" title={successMessage}>The restored definition is available from Suites.</Alert>}
    {empty && <Card><EmptyState title="Trash is empty" description="Suites and cases moved to Trash will appear here without deleting their run history." action={<Link className="button button-secondary" to={`/projects/${projectId}/suites`}>View active suites</Link>} /></Card>}
    {query.data.suites.length > 0 && <Card><h2>Suites</h2><ul className="resource-list">{query.data.suites.map(suite => <li key={suite.id}><div><Link to={`/projects/${projectId}/suites/${suite.id}`}>{suite.name}</Link><p className="muted">Archived {formatDate(suite.archivedAt)}</p></div><div className="inline-actions"><StatusBadge status="neutral">ARCHIVED</StatusBadge>{canRestore && <Button variant="secondary" onClick={() => { restore.reset(); setSelection({ kind: 'suite', suite }) }}>Restore</Button>}</div></li>)}</ul></Card>}
    {query.data.cases.length > 0 && <Card><h2>Cases</h2><ul className="resource-list">{query.data.cases.map(({ suite, testCase }) => <li key={testCase.id}><div><Link to={`/projects/${projectId}/suites/${suite.id}/cases/${testCase.id}`}>{testCase.name}</Link><p className="muted">Suite: {suite.name} · Archived {formatDate(testCase.archivedAt)}</p></div><div className="inline-actions"><StatusBadge status="neutral">ARCHIVED</StatusBadge>{canRestore && suite.status !== 'ARCHIVED' && <Button variant="secondary" onClick={() => { restore.reset(); setSelection({ kind: 'case', suite, testCase }) }}>Restore</Button>}</div></li>)}</ul></Card>}
    {selection && <RestoreDefinitionDialog open kind={selection.kind} currentName={selection.kind === 'suite' ? selection.suite.name : selection.testCase.name} busy={restore.isPending} error={restore.error} onClose={() => { setSelection(undefined); restore.reset() }} onRestore={name => restore.mutate(name)} />}
  </section>
}

function formatDate(value?: string) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'at an unknown time'
}
