import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Alert, Button, Card, ConfirmDialog, EmptyState, LoadingState, StatusBadge } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { projectKeys, projectsApi, type Suite } from './api'
import { useProjectWorkspace } from './ProjectWorkspaceContext'
import { RestoreDefinitionDialog } from './DefinitionLifecycle'

const suiteSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().max(2000).optional(),
})
type SuiteForm = z.infer<typeof suiteSchema>

export function SuitesPage() {
  const { projectId = '' } = useParams()
  const { project } = useProjectWorkspace()
  const client = useQueryClient()
  const canManage = project.permissions.includes('DEFINITION_MANAGE') && project.status === 'ACTIVE'
  const query = useQuery({ queryKey: projectKeys.suites(projectId), queryFn: () => projectsApi.suites(projectId) })
  const form = useForm<SuiteForm>({
    resolver: zodResolver(suiteSchema),
    defaultValues: { name: '', description: '' },
  })
  const mutation = useMutation({
    mutationFn: projectsApi.createSuite.bind(null, projectId),
    onSuccess: () => {
      form.reset()
      void client.invalidateQueries({ queryKey: projectKeys.suites(projectId) })
      void client.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
    },
  })

  return <section className="page-stack">
    {canManage && <Card>
      <div className="section-heading"><div><p className="eyebrow">Definitions</p><h2>Create a suite</h2></div></div>
      <form className="inline-form" onSubmit={form.handleSubmit(values => mutation.mutate(values))}>
        <label>Suite name<input aria-label="Suite name" autoComplete="off" placeholder="Checkout smoke…" {...form.register('name')} /></label>
        <label>Description<input aria-label="Suite description" autoComplete="off" placeholder="What does this suite cover…" {...form.register('description')} /></label>
        <Button type="submit" busy={mutation.isPending}>Add suite</Button>
      </form>
      {form.formState.errors.name && <p className="form-error" role="alert">{form.formState.errors.name.message}</p>}
      {mutation.isError && <p className="form-error" role="alert">Unable to create the suite. Try again.</p>}
    </Card>}
    {!canManage && <Alert tone="warning" title="Suite definitions are read-only.">Your project role does not allow definition changes.</Alert>}
    {query.isPending && <Card><LoadingState label="Loading suites…" /></Card>}
    {query.isError && <Alert tone="danger" title="Unable to load suites.">Try again after the backend is ready.</Alert>}
    {query.data?.length
      ? <div className="project-grid">{query.data.map(suite => <SuiteCard key={suite.id} suite={suite} projectId={projectId} />)}</div>
      : query.data
        ? <Card><EmptyState title="No suites yet" description={canManage ? 'Create a suite to group related browser checks and start authoring cases.' : 'A project manager can create the first suite.'} /></Card>
        : null}
  </section>
}

function SuiteCard({ suite, projectId }: { suite: Suite; projectId: string }) {
  return <Link className="card project-card" to={`/projects/${projectId}/suites/${suite.id}`}>
    <p className="eyebrow">Suite</p>
    <h2>{suite.name}</h2>
    <p>{suite.description || 'No description yet.'}</p>
  </Link>
}

export function SuitePage() {
  const { projectId = '', suiteId = '' } = useParams()
  const { project } = useProjectWorkspace()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const suiteQuery = useQuery({ queryKey: projectKeys.suite(projectId, suiteId), queryFn: () => projectsApi.getSuite(projectId, suiteId) })
  const suite = suiteQuery.data
  const archived = suite?.status === 'ARCHIVED'
  const caseLifecycle = archived ? 'ALL' : 'ACTIVE'
  const casesQuery = useQuery({ queryKey: [...projectKeys.cases(projectId, suiteId), caseLifecycle], queryFn: () => projectsApi.cases(projectId, suiteId, caseLifecycle), enabled: Boolean(suite) })
  const canManage = project.permissions.includes('DEFINITION_MANAGE') && project.status === 'ACTIVE' && !archived
  const canRun = project.permissions.includes('EXECUTION_START') && project.status === 'ACTIVE' && !archived
  const form = useForm<SuiteForm>({ resolver: zodResolver(suiteSchema), defaultValues: { name: '', description: '' } })
  useEffect(() => { if (suite) form.reset({ name: suite.name, description: suite.description ?? '' }) }, [form, suite])
  const update = useMutation({
    mutationFn: (values: SuiteForm) => projectsApi.updateSuite(projectId, suiteId, { ...values, projectVersion: suite?.version ?? 0 }),
    onSuccess: saved => { client.setQueryData(projectKeys.suite(projectId, suiteId), saved); void client.invalidateQueries({ queryKey: projectKeys.suites(projectId) }); setEditing(false) },
  })
  const archive = useMutation({
    mutationFn: () => projectsApi.archiveSuite(projectId, suiteId, suite?.version ?? 0),
    onSuccess: saved => { client.setQueryData(projectKeys.suite(projectId, suiteId), saved); void client.invalidateQueries({ queryKey: projectKeys.suites(projectId) }); void client.invalidateQueries({ queryKey: projectKeys.trash(projectId) }); navigate(`/projects/${projectId}/trash`) },
  })
  const restore = useMutation({
    mutationFn: (name?: string) => projectsApi.restoreSuite(projectId, suiteId, { version: suite?.version ?? 0, name }),
    onSuccess: saved => { client.setQueryData(projectKeys.suite(projectId, suiteId), saved); void client.invalidateQueries({ queryKey: projectKeys.suites(projectId) }); void client.invalidateQueries({ queryKey: projectKeys.trash(projectId) }); setRestoreOpen(false) },
  })
  const run = useMutation({
    mutationFn: () => projectsApi.queueSuite(projectId, suiteId),
    onSuccess: result => {
      void client.invalidateQueries({ queryKey: projectKeys.executions(projectId) })
      navigate(`/projects/${projectId}/executions/${result.executionId}`)
    },
  })

  if (suiteQuery.isPending) return <Card><LoadingState label="Loading suite…" /></Card>
  if (suiteQuery.isError || !suite) return <Alert tone="danger" title="Unable to load this suite.">The suite may not exist in this project.</Alert>

  return <Card>
    {archived && <Alert tone="warning" title="This suite is in Trash.">Its cases and run history remain available, but the suite is read-only until restored.</Alert>}
    <div className="page-heading compact">
      <div><p className="eyebrow">Suite</p><h1>{suite.name}</h1><p className="muted">{suite.description || 'No description yet.'}</p></div>
      <div className="inline-actions">
        {canRun && <Button onClick={() => run.mutate()} busy={run.isPending}>Run ready cases</Button>}
        <Link className="button button-secondary" to={`/projects/${projectId}/executions`}>Runs</Link>
        {canManage && <Link className="button button-secondary" to={`/projects/${projectId}/suites/${suiteId}/cases/new`}>New case</Link>}
        {canManage && <Button variant="secondary" onClick={() => setEditing(value => !value)}>{editing ? 'Cancel edit' : 'Edit suite'}</Button>}
        {canManage && <Button variant="danger" onClick={() => setTrashOpen(true)}>Move to trash</Button>}
        {project.permissions.includes('DEFINITION_MANAGE') && project.status === 'ACTIVE' && archived && <Button onClick={() => setRestoreOpen(true)}>Restore suite</Button>}
      </div>
    </div>
    {editing && <form className="form-stack definition-edit" onSubmit={form.handleSubmit(values => update.mutate(values))}>
      <label>Suite name<input autoFocus autoComplete="off" {...form.register('name')} /></label>
      <label>Description<textarea rows={4} {...form.register('description')} /></label>
      {form.formState.errors.name && <p className="form-error" role="alert">{form.formState.errors.name.message}</p>}
      {update.isError && <p className="form-error" role="alert">{update.error instanceof ApiError ? update.error.message : 'Unable to update this suite.'}</p>}
      <Button type="submit" busy={update.isPending}>Save suite</Button>
    </form>}
    <div className="section-heading"><div><h2>Test cases</h2><p className="muted">Only READY cases are included when you run a suite.</p></div></div>
    {run.isError && <Alert tone="danger" title="Unable to queue this suite run.">Make sure the suite contains at least one READY case.</Alert>}
    {casesQuery.isPending && <LoadingState label="Loading test cases…" />}
    {casesQuery.isError && <Alert tone="danger" title="Unable to load test cases.">Try again after the backend is ready.</Alert>}
    {casesQuery.data?.length
      ? <ul className="resource-list">{casesQuery.data.map(testCase => <li key={testCase.id}>
          <Link to={`/projects/${projectId}/suites/${suiteId}/cases/${testCase.id}`}>{testCase.name}</Link>
          <StatusBadge status={testCase.status === 'READY' ? 'success' : 'neutral'}>{testCase.status} · {testCase.priority}</StatusBadge>
        </li>)}</ul>
      : casesQuery.data
        ? <EmptyState title="No cases yet" description={canManage ? 'Create a case from a template or start with a blank case.' : 'A test manager can create the first case.'} action={canManage && <Link className="button" to={`/projects/${projectId}/suites/${suiteId}/cases/new`}>Create first case</Link>} />
        : null}
    <ConfirmDialog open={trashOpen} title={`Move ${suite.name} to Trash?`} description="The suite and its cases become read-only and cannot run. Existing execution history remains available." confirmLabel="Move to trash" busy={archive.isPending} onClose={() => setTrashOpen(false)} onConfirm={() => archive.mutate()} />
    <RestoreDefinitionDialog open={restoreOpen} kind="suite" currentName={suite.name} busy={restore.isPending} error={restore.error} onClose={() => { setRestoreOpen(false); restore.reset() }} onRestore={name => restore.mutate(name)} />
  </Card>
}
