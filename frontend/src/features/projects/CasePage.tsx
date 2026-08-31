import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { Alert, Button, Card, ConfirmDialog, LoadingState, StatusBadge } from '../../components/ui'
import { ExecutionQueueErrorAlert } from '../executions/ExecutionQueueErrorAlert'
import { ApiError } from '../../lib/api'
import { GuidedStepEditor } from './GuidedCasePage'
import { firstStepErrorTarget, mapServerStepErrors, serializeSteps, toEditableSteps, validateSteps, type EditableStep, type StepValidationErrors } from './caseBuilder'
import { platformApi, projectKeys, projectsApi, type TestCase } from './api'
import { useProjectWorkspace } from './ProjectWorkspaceContext'
import { RestoreDefinitionDialog } from './DefinitionLifecycle'
import { CaseVersionConflict } from './CaseVersionConflict'
import { ProjectErrorAlert } from './ProjectErrorAlert'

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
  // Direct case links must respect the parent suite lifecycle too. Loading
  // the suite alongside the case keeps the editor read-only before a blocked
  // mutation reaches the backend.
  const suiteQuery = useQuery({ queryKey: projectKeys.suite(projectId, suiteId), queryFn: () => projectsApi.getSuite(projectId, suiteId) })
  const options = useQuery({ queryKey: ['platform', 'options'], queryFn: platformApi.options, staleTime: 60_000 })
  const [steps, setSteps] = useState<EditableStep[]>([])
  const [stepErrors, setStepErrors] = useState<StepValidationErrors>({})
  const [focusTarget, setFocusTarget] = useState<string>()
  const [successMessage, setSuccessMessage] = useState<string>()
  const [trashOpen, setTrashOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [versionConflict, setVersionConflict] = useState<TestCase>()
  const allowNavigation = useRef(false)
  const form = useForm<CaseForm>()
  const definitions = useMemo(() => options.data?.stepActions ?? [], [options.data?.stepActions])
  const archived = query.data?.status === 'ARCHIVED'
  const suiteArchived = suiteQuery.data?.status === 'ARCHIVED'
  const canManage = project.permissions.includes('DEFINITION_MANAGE') && project.status === 'ACTIVE'
  const canEdit = canManage && !archived && !suiteArchived
  const canRun = project.permissions.includes('EXECUTION_START') && project.status === 'ACTIVE' && !archived && !suiteArchived
  const currentStepsSignature = useMemo(() => JSON.stringify(serializeSteps(steps)), [steps])
  const savedStepsSignature = query.data ? JSON.stringify(query.data.steps.map((step, position) => ({ ...step, position }))) : ''
  const dirty = Boolean(query.data) && canEdit && (form.formState.isDirty || currentStepsSignature !== savedStepsSignature)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => Boolean(dirty) && !allowNavigation.current && currentLocation.pathname !== nextLocation.pathname)

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

  useEffect(() => {
    if (!dirty) return undefined
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const latestCase = useMutation({
    mutationFn: () => projectsApi.getCase(projectId, suiteId, caseId),
    onSuccess: setVersionConflict,
  })
  const save = useMutation({
    mutationFn: ({ values, expectedVersion }: { values: CaseForm; expectedVersion?: number }) => {
      if (values.status === 'READY') {
        const validation = validateSteps(steps, definitions)
        setStepErrors(validation.errors)
        if (validation.message) {
          setFocusTarget(firstStepErrorTarget(validation.errors, steps))
          throw new Error(validation.message)
        }
      }
      setFocusTarget(undefined)
      return projectsApi.updateCase(projectId, suiteId, caseId, {
        ...values,
        projectVersion: expectedVersion ?? query.data?.version,
        steps: serializeSteps(steps),
      })
    },
    onSuccess: saved => {
      setSuccessMessage('Case and steps saved.')
      setVersionConflict(undefined)
      setStepErrors({})
      setFocusTarget(undefined)
      client.setQueryData(queryKey, saved)
      void client.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
    },
    onError: error => {
      if (!(error instanceof ApiError)) return
      const mapped = mapServerStepErrors(error.fieldErrors, steps)
      if (Object.keys(mapped).length) {
        setStepErrors(mapped)
        setFocusTarget(firstStepErrorTarget(mapped, steps))
      }
      if (error.fieldErrors.name) form.setError('name', { message: error.fieldErrors.name }, { shouldFocus: true })
      if (error.code === 'case_name_taken') form.setError('name', { message: 'A case with this name already exists.' }, { shouldFocus: true })
      if (error.code === 'stale_version') latestCase.mutate()
    },
  })
  const reloadServerVersion = () => {
    if (!versionConflict) return
    client.setQueryData(queryKey, versionConflict)
    setVersionConflict(undefined)
    setStepErrors({})
    setFocusTarget(undefined)
    form.clearErrors()
    setSuccessMessage('Reloaded the latest server version.')
  }
  const run = useMutation({
    mutationFn: () => projectsApi.queueCase(projectId, suiteId, caseId),
    onSuccess: result => {
      void client.invalidateQueries({ queryKey: projectKeys.executions(projectId) })
      allowNavigation.current = true
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
      allowNavigation.current = true
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

  if (query.isPending || suiteQuery.isPending || options.isPending) return <Card><LoadingState label="Loading case editor…" /></Card>
  if (query.isError || suiteQuery.isError || !query.data || !suiteQuery.data || options.isError) {
    const error = query.error ?? suiteQuery.error ?? options.error
    return <ProjectErrorAlert title="Unable to load this case." error={error} fallback="Retry after the backend is ready." retryLabel="Reload case" onRetry={() => void Promise.all([query.refetch(), suiteQuery.refetch(), options.refetch()])} />
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
        {canRun && query.data.status === 'READY' && <Button onClick={() => run.mutate()} busy={run.isPending}>Run case</Button>}
        <Link className="button button-secondary" to={`/projects/${projectId}/executions`}>Runs</Link>
        {canEdit && <Button variant="danger" onClick={() => setTrashOpen(true)}>Move to trash</Button>}
        {canManage && archived && !suiteArchived && <Button onClick={() => setRestoreOpen(true)}>Restore case</Button>}
      </div>
    </div>
    {suiteArchived
      ? <Alert tone="warning" title="This case belongs to a suite in Trash.">The archived suite keeps its cases and execution history available, but all child definitions are read-only until the suite is restored.</Alert>
      : !archived && !canEdit && <Alert tone="warning" title="Read-only case.">{project.status === 'ARCHIVED' ? 'The project is archived.' : 'Your project role does not allow definition changes.'}</Alert>}
    {run.isError && <ExecutionQueueErrorAlert error={run.error} busy={run.isPending} onRetry={() => run.mutate()} />}
    {successMessage && <Alert tone="success" title={successMessage}>The latest definition is ready for your next action.</Alert>}
    {latestCase.isError && <ProjectErrorAlert title="Unable to load the latest case." error={latestCase.error} fallback="Your changes are still in this editor." retryLabel="Retry comparison" busy={latestCase.isPending} onRetry={() => latestCase.mutate()} />}
    {versionConflict && <CaseVersionConflict
      local={{ ...form.watch(), steps: serializeSteps(steps) }}
      server={versionConflict}
      busy={save.isPending || latestCase.isPending}
      onReload={reloadServerVersion}
      onRetry={() => save.mutate({ values: form.getValues(), expectedVersion: versionConflict.version })}
    />}
    {canEdit
      ? <form className="form-stack" onSubmit={form.handleSubmit(values => { setSuccessMessage(undefined); save.mutate({ values }) })}>
          <label>Name<input autoComplete="off" aria-invalid={Boolean(form.formState.errors.name)} aria-describedby={form.formState.errors.name ? 'case-name-error' : undefined} {...form.register('name', { required: 'Name is required' })} />{form.formState.errors.name && <small id="case-name-error" className="form-error">{form.formState.errors.name.message}</small>}</label>
          <label>Description<textarea autoComplete="off" rows={4} {...form.register('description')} /></label>
          <div className="inline-form">
            <label>Status<select autoComplete="off" {...form.register('status')}><option>DRAFT</option><option>READY</option></select></label>
            <label>Priority<select autoComplete="off" {...form.register('priority')}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
            <label>Retry count<input type="number" autoComplete="off" min={0} max={5} {...form.register('retryCount', { valueAsNumber: true })} /></label>
          </div>
          <label>Tags<input autoComplete="off" placeholder="P0, smoke" {...form.register('tags')} /></label>
          <label className="checkbox-field"><input type="checkbox" {...form.register('dataIsolation')} />Use a fresh isolated browser context for this case</label>
          {save.isError && (!(save.error instanceof ApiError) || save.error.code !== 'stale_version') && <p className="form-error" role="alert">{save.error instanceof ApiError ? save.error.message : save.error.message || 'Unable to save this case.'}</p>}
          <Button type="submit" busy={save.isPending} disabled={Boolean(versionConflict)}>Save case and steps</Button>
        </form>
      : <StaticCaseDetails testCase={query.data} />}
    {canEdit
      ? <GuidedStepEditor steps={steps} onChange={setSteps} definitions={definitions} locatorTypes={options.data.supportedLocatorTypes} roles={options.data.supportedLocatorRoles ?? []} errors={stepErrors} focusTarget={focusTarget} />
      : <StaticStepList steps={query.data.steps} />}
    <ConfirmDialog open={blocker.state === 'blocked'} title="Leave without saving?" description="Your case changes will be lost if you leave this page." confirmLabel="Leave page" onClose={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()} />
    <ConfirmDialog open={trashOpen} title={`Move ${query.data.name} to Trash?`} description="The case becomes read-only and cannot run. Its steps and execution history remain available." confirmLabel="Move to trash" busy={archive.isPending} onClose={() => { setTrashOpen(false); archive.reset() }} onConfirm={() => archive.mutate()}>
      {archive.isError && <ProjectErrorAlert title="Unable to move this case to Trash." error={archive.error} fallback="The case remains active." retryLabel="Retry move to trash" busy={archive.isPending} onRetry={() => archive.mutate()} />}
    </ConfirmDialog>
    <RestoreDefinitionDialog open={restoreOpen} kind="case" currentName={query.data.name} busy={restore.isPending} error={restore.error} onClose={() => { setRestoreOpen(false); restore.reset() }} onRestore={name => restore.mutate(name)} />
  </Card>
}

function StaticCaseDetails({ testCase }: { testCase: TestCase }) {
  return <section aria-labelledby="case-details-title">
    <h2 id="case-details-title">Case details</h2>
    <dl>
      <div><dt>Description</dt><dd>{testCase.description || 'No description yet.'}</dd></div>
      <div><dt>Status</dt><dd>{testCase.status}</dd></div>
      <div><dt>Priority</dt><dd>{testCase.priority}</dd></div>
      <div><dt>Retry count</dt><dd>{testCase.retryCount}</dd></div>
      <div><dt>Tags</dt><dd>{testCase.tags || 'No tags'}</dd></div>
      <div><dt>Browser context</dt><dd>{testCase.dataIsolation ? 'Fresh isolated context' : 'Shared policy context'}</dd></div>
    </dl>
  </section>
}

function StaticStepList({ steps }: { steps: import('./api').Step[] }) {
  return <section className="static-steps" aria-labelledby="case-steps-title"><h2 id="case-steps-title">Steps</h2>{steps.length === 0
    ? <p className="muted">No steps have been defined.</p>
    : <ol>{steps.map(step => <li key={step.id ?? step.position}><strong>{step.position + 1}. {step.action}</strong><span>{[step.locatorType, step.locatorRole, step.locatorValue, step.inputValue, step.expectedValue].filter(Boolean).join(' · ') || 'No additional values'}</span></li>)}</ol>}</section>
}
