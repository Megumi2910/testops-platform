import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { Alert, Button, Card, ConfirmDialog, LoadingState, StatusBadge } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { GuidedStepEditor } from './GuidedCasePage'
import { serializeSteps, toEditableSteps, validateSteps, type EditableStep } from './caseBuilder'
import { platformApi, projectKeys, projectsApi } from './api'
import { useProjectWorkspace } from './ProjectWorkspaceContext'
import { RestoreDefinitionDialog } from './DefinitionLifecycle'

type CaseForm = {
  name: string
  description: string
  status: string
  priority: string
  tags: string
  retryCount: number
  dataIsolation: boolean
}

export function CasePage() {
  const { projectId = '', suiteId = '', caseId = '' } = useParams()
  const { project } = useProjectWorkspace()
  const navigate = useNavigate()
  const client = useQueryClient()
  const queryKey = ['case', projectId, suiteId, caseId] as const
  const query = useQuery({ queryKey, queryFn: () => projectsApi.getCase(projectId, suiteId, caseId) })
  const options = useQuery({ queryKey: ['platform', 'options'], queryFn: platformApi.options, staleTime: 60_000 })
  const [steps, setSteps] = useState<EditableStep[]>([])
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState<string>()
  const [trashOpen, setTrashOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const form = useForm<CaseForm>()
  const definitions = useMemo(() => options.data?.stepActions ?? [], [options.data?.stepActions])
  const archived = query.data?.status === 'ARCHIVED'
  const canManage = project.permissions.includes('DEFINITION_MANAGE') && project.status === 'ACTIVE'
  const canEdit = canManage && !archived
  const canRun = project.permissions.includes('EXECUTION_START') && project.status === 'ACTIVE' && !archived

  useEffect(() => {
    if (!query.data) return
    setSteps(toEditableSteps(query.data.steps))
    form.reset({
      name: query.data.name,
      description: query.data.description ?? '',
      status: query.data.status,
      priority: query.data.priority,
      tags: query.data.tags ?? '',
      retryCount: query.data.retryCount,
      dataIsolation: query.data.dataIsolation,
    })
  }, [form, query.data])

  const save = useMutation({
    mutationFn: (values: CaseForm) => {
      if (values.status === 'READY') {
        const validation = validateSteps(steps, definitions)
        setStepErrors(validation.errors)
        if (validation.message) throw new Error(validation.message)
      }
      return projectsApi.updateCase(projectId, suiteId, caseId, {
        ...values,
        projectVersion: query.data?.version,
        steps: serializeSteps(steps),
      })
    },
    onSuccess: saved => {
      setSuccessMessage('Case and steps saved.')
      setStepErrors({})
      client.setQueryData(queryKey, saved)
      void client.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
    },
  })
  const run = useMutation({
    mutationFn: () => projectsApi.queueCase(projectId, suiteId, caseId),
    onSuccess: result => {
      void client.invalidateQueries({ queryKey: projectKeys.executions(projectId) })
      navigate(`/projects/${projectId}/executions/${result.executionId}`)
    },
  })
  const archive = useMutation({
    mutationFn: () => projectsApi.archiveCase(projectId, suiteId, caseId, query.data?.version ?? 0),
    onSuccess: saved => {
      client.setQueryData(queryKey, saved)
      void client.invalidateQueries({ queryKey: projectKeys.cases(projectId, suiteId) })
      void client.invalidateQueries({ queryKey: projectKeys.trash(projectId) })
      setTrashOpen(false)
      navigate(`/projects/${projectId}/trash`)
    },
  })
  const restore = useMutation({
    mutationFn: (name?: string) => projectsApi.restoreCase(projectId, suiteId, caseId, { version: query.data?.version ?? 0, name }),
    onSuccess: saved => {
      client.setQueryData(queryKey, saved)
      void client.invalidateQueries({ queryKey: projectKeys.cases(projectId, suiteId) })
      void client.invalidateQueries({ queryKey: projectKeys.trash(projectId) })
      setRestoreOpen(false)
    },
  })

  if (query.isPending || options.isPending) return <Card><LoadingState label="Loading case editor…" /></Card>
  if (query.isError || !query.data || options.isError) {
    return <Alert tone="danger" title="Unable to load this case.">Retry after the backend is ready.</Alert>
  }

  return <Card>
    {archived && <Alert tone="warning" title="This case is in Trash.">Its steps and execution history are read-only. Restore it to DRAFT before editing or running it.</Alert>}
    <div className="page-heading compact">
      <div>
        <p className="eyebrow">Test case editor</p>
        <h1>{query.data.name}</h1>
        <StatusBadge status={query.data.status === 'READY' ? 'success' : 'neutral'}>{query.data.status}</StatusBadge>
      </div>
      <div className="inline-actions">
        {canRun && <Button onClick={() => run.mutate()} busy={run.isPending} disabled={query.data.status !== 'READY'}>Run case</Button>}
        <Link className="button button-secondary" to={`/projects/${projectId}/executions`}>Runs</Link>
        {canEdit && <Button variant="danger" onClick={() => setTrashOpen(true)}>Move to trash</Button>}
        {canManage && archived && <Button onClick={() => setRestoreOpen(true)}>Restore case</Button>}
      </div>
    </div>
    {!canEdit && <Alert tone="warning" title="Read-only case.">Your project role does not allow definition changes.</Alert>}
    {run.isError && <Alert tone="danger" title="Unable to queue this case.">Save a valid READY case, then try again.</Alert>}
    {successMessage && <Alert tone="success" title={successMessage}>The latest definition is ready for your next action.</Alert>}
    <form className="form-stack" onSubmit={form.handleSubmit(values => { setSuccessMessage(undefined); save.mutate(values) })}>
      <label>Name<input disabled={!canEdit} {...form.register('name', { required: true })} /></label>
      <label>Description<textarea disabled={!canEdit} rows={4} {...form.register('description')} /></label>
      <div className="inline-form">
        <label>Status<select disabled={!canEdit} {...form.register('status')}><option>DRAFT</option><option>READY</option></select></label>
        <label>Priority<select disabled={!canEdit} {...form.register('priority')}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
      </div>
      {save.isError && <p className="form-error" role="alert">{save.error instanceof ApiError ? save.error.message : save.error.message || 'Unable to save this case.'}</p>}
      {canEdit && <Button type="submit" busy={save.isPending}>Save case and steps</Button>}
    </form>
    {canEdit
      ? <GuidedStepEditor steps={steps} onChange={setSteps} definitions={definitions} locatorTypes={options.data.supportedLocatorTypes} roles={options.data.supportedLocatorRoles ?? []} errors={stepErrors} />
      : <StaticStepList steps={query.data.steps} />}
    <ConfirmDialog open={trashOpen} title={`Move ${query.data.name} to Trash?`} description="The case becomes read-only and cannot run. Its steps and execution history remain available." confirmLabel="Move to trash" busy={archive.isPending} onClose={() => setTrashOpen(false)} onConfirm={() => archive.mutate()} />
    <RestoreDefinitionDialog open={restoreOpen} kind="case" currentName={query.data.name} busy={restore.isPending} error={restore.error} onClose={() => { setRestoreOpen(false); restore.reset() }} onRestore={name => restore.mutate(name)} />
  </Card>
}

function StaticStepList({ steps }: { steps: import('./api').Step[] }) {
  return <section className="static-steps" aria-labelledby="case-steps-title"><h2 id="case-steps-title">Steps</h2>{steps.length === 0
    ? <p className="muted">No steps have been defined.</p>
    : <ol>{steps.map(step => <li key={step.id ?? step.position}><strong>{step.position + 1}. {step.action}</strong><span>{[step.locatorType, step.locatorRole, step.locatorValue, step.inputValue, step.expectedValue].filter(Boolean).join(' · ') || 'No additional values'}</span></li>)}</ol>}</section>
}
