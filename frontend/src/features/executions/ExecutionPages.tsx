import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Alert, Button, Card, EmptyState, LoadingState, PageHeader, StatusBadge } from '../../components/ui'
import { ApiError, apiBlobFetch } from '../../lib/api'
import { projectKeys, projectsApi, type CaseResult, type ExecutionArtifact, type ExecutionSummary } from '../projects/api'
import { ExecutionQueueErrorAlert } from './ExecutionQueueErrorAlert'
import { executionDetailRefetchInterval, getExecutionFailureGuidance } from './executionGuidance'

const terminalStatuses = new Set(['PASSED', 'FAILED', 'ERROR', 'CANCELLED'])
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const integerFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

function formatDateTime(value?: string) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : dateTimeFormatter.format(date)
}

function formatInteger(value: number) {
  return integerFormatter.format(value)
}

function formatKilobytes(byteSize: number) {
  return `${formatInteger(Math.ceil(byteSize / 1024))}\u00a0KB`
}

function statusTone(status: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (status === 'PASSED') return 'success'
  if (status === 'FAILED' || status === 'ERROR') return 'danger'
  if (status === 'CANCELLED') return 'warning'
  if (status === 'QUEUED' || status === 'RUNNING') return 'info'
  return 'neutral'
}

function evidenceReason(code: string | undefined, kind: 'suppression' | 'purge') {
  if (code === 'SECRET_VARIABLE_USED') return 'A secret variable was used, so screenshots and traces were not retained. Reason: SECRET_VARIABLE_USED.'
  if (code === 'RETENTION_POLICY') return 'The artifact passed its configured retention period. Reason: RETENTION_POLICY.'
  return kind === 'suppression'
    ? `Evidence policy prevented retention.${code ? ` Reason: ${code}.` : ''}`
    : `The artifact is no longer retained.${code ? ` Reason: ${code}.` : ''}`
}

function artifactUnavailable(artifact: ExecutionArtifact, result: CaseResult | undefined, unavailableAfterRequest: boolean) {
  if (artifact.secretSuppressed || result?.evidenceSuppressed) {
    return { label: 'Suppressed', detail: evidenceReason(result?.evidenceSuppressionReason, 'suppression') }
  }
  if (artifact.purgedAt) return { label: 'Purged', detail: evidenceReason(artifact.purgeReason, 'purge') }
  if (unavailableAfterRequest) return { label: 'Unavailable', detail: 'The server reported that this artifact is no longer available. Reload the execution to refresh its retention status.' }
  return undefined
}

function ScreenshotPreviewDialog({ label, url, onClose }: { label: string; url: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useLayoutEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        closeRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus.current?.isConnected) previousFocus.current.focus()
    }
  }, [])

  return <div ref={dialogRef} className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="artifact-preview-title" aria-describedby="artifact-preview-description" tabIndex={-1}>
    <button type="button" className="dialog-dismiss-layer" aria-label="Dismiss screenshot preview" tabIndex={-1} onClick={onClose} />
    <div className="dialog artifact-dialog">
      <div className="dialog-header"><h2 id="artifact-preview-title">{label}</h2><button ref={closeRef} className="button button-ghost" type="button" onClick={onClose}>Close preview</button></div>
      <p id="artifact-preview-description">Screenshot evidence from this execution. Close the preview to return to the artifact action.</p>
      <img src={url} alt={`${label} evidence`} width="1280" height="720" />
    </div>
  </div>
}

export function ExecutionsPage() {
  const { projectId = '' } = useParams()
  const query = useQuery({
    queryKey: projectKeys.executions(projectId),
    queryFn: () => projectsApi.executions(projectId),
    refetchInterval: state => state.state.data?.some(execution => !terminalStatuses.has(execution.status)) ? 2000 : false,
  })
  if (query.isPending) return <Card><LoadingState label="Loading executions…" /></Card>
  if (query.isError) return <Alert tone="danger" title="Unable to load executions."><div className="inline-actions"><span>{query.error instanceof ApiError ? query.error.message : 'Try again after the backend is ready.'}</span><Button type="button" variant="secondary" onClick={() => void query.refetch()} busy={query.isFetching}>Try again</Button></div></Alert>
  return <section className="page-stack"><PageHeader eyebrow="Execution history" title="Runs" description="Track queued, running, and completed browser checks." actions={<Link className="button button-secondary" to={`/projects/${projectId}`}>Back to project</Link>} /><Card><ExecutionTable executions={query.data} projectId={projectId} /></Card></section>
}

function ExecutionTable({ executions, projectId }: { executions: ExecutionSummary[]; projectId: string }) {
  if (!executions.length) return <EmptyState title="No runs yet" description="Create a READY case, then queue it from its suite." action={<Link className="button" to={`/projects/${projectId}/suites`}>Open suites</Link>} />
  return <div className="table-scroll"><table><caption className="sr-only">Execution history</caption><thead><tr><th scope="col">Status</th><th scope="col">Suite snapshot</th><th scope="col">Created</th><th scope="col">Progress</th><th scope="col">Result</th></tr></thead><tbody>{executions.map(execution => <tr key={execution.id}><td><Link className="table-status" to={`/projects/${projectId}/executions/${execution.id}`}><StatusBadge status={statusTone(execution.status)}>{execution.status}</StatusBadge></Link></td><td>{execution.suiteNameSnapshot || 'Not recorded'}</td><td>{formatDateTime(execution.createdAt)}</td><td className="tabular-nums">{formatInteger(execution.completedCases)}/{formatInteger(execution.totalCases)}</td><td className="tabular-nums">{formatInteger(execution.passedCases)} passed · {formatInteger(execution.failedCases)} failed</td></tr>)}</tbody></table></div>
}

export function ExecutionDetailPage() {
  const { projectId = '', executionId = '' } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [preview, setPreview] = useState<{ url: string; label: string }>()
  const [artifactError, setArtifactError] = useState<string>()
  const [artifactPending, setArtifactPending] = useState<string>()
  const [failedArtifact, setFailedArtifact] = useState<ExecutionArtifact>()
  const [unavailableArtifactIds, setUnavailableArtifactIds] = useState<Set<string>>(() => new Set())
  const closePreview = useCallback(() => setPreview(undefined), [])
  const projectQuery = useQuery({ queryKey: projectKeys.detail(projectId), queryFn: () => projectsApi.get(projectId), staleTime: 30_000, enabled: Boolean(projectId) })
  const query = useQuery({
    queryKey: projectKeys.execution(projectId, executionId),
    queryFn: () => projectsApi.execution(projectId, executionId),
    refetchInterval: state => executionDetailRefetchInterval(state.state.data),
  })
  const caseResultsById = useMemo(() => new Map(query.data?.cases.map(result => [result.id, result]) ?? []), [query.data?.cases])
  const cancel = useMutation({
    mutationFn: () => projectsApi.cancelExecution(projectId, executionId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: projectKeys.execution(projectId, executionId) })
      void client.invalidateQueries({ queryKey: projectKeys.executions(projectId) })
    },
  })
  const runAgain = useMutation({
    mutationFn: (suiteId: string) => projectsApi.queueSuite(projectId, suiteId),
    onSuccess: result => {
      void client.invalidateQueries({ queryKey: projectKeys.executions(projectId) })
      navigate(`/projects/${projectId}/executions/${result.executionId}`)
    },
  })
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url) }, [preview?.url])

  if (query.isPending) return <Card><LoadingState label="Loading execution…" /></Card>
  if (query.isError || !query.data) return <Alert tone="danger" title="Unable to load this execution."><div className="inline-actions"><span>Return to runs and try again.</span><Button type="button" variant="secondary" onClick={() => void query.refetch()} busy={query.isFetching}>Try again</Button></div></Alert>

  const execution = query.data
  const canRunAgain = Boolean(terminalStatuses.has(execution.status) && execution.suiteId && projectQuery.data?.status === 'ACTIVE' && projectQuery.data.permissions.includes('EXECUTION_START'))
  const loadArtifact = async (artifact: ExecutionArtifact) => {
    setArtifactPending(artifact.id)
    setArtifactError(undefined)
    setFailedArtifact(undefined)
    try {
      const blob = await apiBlobFetch(`/api/v1/projects/${projectId}/executions/${execution.id}/artifacts/${artifact.id}`)
      if (artifact.type === 'SCREENSHOT') {
        setPreview({ url: URL.createObjectURL(blob), label: artifact.stepPosition === undefined ? 'Execution screenshot' : `Screenshot · step ${artifact.stepPosition + 1}` })
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = artifact.downloadFilename
        link.style.display = 'none'
        document.body.append(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        setUnavailableArtifactIds(current => new Set(current).add(artifact.id))
        setArtifactError('The artifact is no longer available. Reload the execution to refresh its retention status.')
      } else {
        setFailedArtifact(artifact)
        setArtifactError('The artifact could not be loaded. It may have expired or the server may be unavailable.')
      }
    } finally {
      setArtifactPending(current => current === artifact.id ? undefined : current)
    }
  }
  const infrastructureGuidance = execution.infrastructureErrorCategory
    ? getExecutionFailureGuidance(execution.infrastructureErrorCategory)
    : execution.status === 'ERROR'
      ? getExecutionFailureGuidance()
      : undefined

  return <section className="page-stack">
    <PageHeader eyebrow="Execution" title={execution.status} description={`${formatInteger(execution.completedCases)} of ${formatInteger(execution.totalCases)} cases complete.`} actions={<div className="inline-actions"><Link className="button button-secondary" to={`/projects/${projectId}/executions`}>Back to runs</Link>{canRunAgain && <Button onClick={() => runAgain.mutate(execution.suiteId!)} busy={runAgain.isPending}>Run suite again</Button>}{execution.canCancel && <Button variant="danger" onClick={() => cancel.mutate()} busy={cancel.isPending}>Cancel run</Button>}</div>} />
    {runAgain.isError && <ExecutionQueueErrorAlert error={runAgain.error} busy={runAgain.isPending} onRetry={() => runAgain.mutate(execution.suiteId!)} />}
    {cancel.isError && <Alert tone="danger" title="Unable to cancel this run."><div className="inline-actions"><span>{cancel.error instanceof ApiError ? cancel.error.message : 'The worker may have completed the run already.'}</span><Button type="button" variant="secondary" onClick={() => cancel.mutate()} busy={cancel.isPending}>Try again</Button></div></Alert>}
    <Card className="progress-card"><StatusBadge status="success">{formatInteger(execution.passedCases)} passed</StatusBadge><StatusBadge status="danger">{formatInteger(execution.failedCases)} failed</StatusBadge><StatusBadge status="warning">{formatInteger(execution.errorCases)} errors</StatusBadge><StatusBadge status="neutral">{formatInteger(execution.cancelledCases)} cancelled</StatusBadge></Card>
    <Card><h2>Run details</h2><dl className="execution-details"><div><dt>Suite snapshot</dt><dd>{execution.suiteNameSnapshot || 'Not recorded'}</dd></div><div><dt>Target snapshot</dt><dd>{execution.targetOriginSnapshot || 'Not recorded'}</dd></div><div><dt>Browser</dt><dd>{execution.browser || 'Not recorded'}</dd></div><div><dt>Queued</dt><dd>{formatDateTime(execution.createdAt)}</dd></div><div><dt>Started</dt><dd>{formatDateTime(execution.startedAt)}</dd></div><div><dt>Finished</dt><dd>{formatDateTime(execution.finishedAt)}</dd></div></dl></Card>
    {infrastructureGuidance && <Alert tone="danger" title={`${infrastructureGuidance.title}.`}><p>{infrastructureGuidance.detail}</p><p><strong>Recommended recovery:</strong> {infrastructureGuidance.recovery}</p>{execution.errorMessage && <p><strong>Sanitized worker detail:</strong> {execution.errorMessage}</p>}{execution.infrastructureErrorCategory && <p className="muted">Category: {execution.infrastructureErrorCategory}</p>}</Alert>}
    <Card><h2>Case results</h2>{execution.cases.length ? execution.cases.map(result => {
      const resultGuidance = result.errorCategory ? getExecutionFailureGuidance(result.errorCategory) : undefined
      const repeatedCategory = result.errorCategory && result.errorCategory === execution.infrastructureErrorCategory
      return <article className="result-card" key={result.id}><div className="result-heading"><div><h3>{result.caseName}</h3><span className="muted"><StatusBadge status={statusTone(result.status)}>{result.status}</StatusBadge> · {formatInteger(result.attemptCount)} attempt(s){result.failedStepPosition !== undefined ? ` · failed at step ${formatInteger(result.failedStepPosition + 1)}` : ''}</span>{(result.startedAt || result.finishedAt) && <><br /><span className="muted">Started {formatDateTime(result.startedAt)} · finished {formatDateTime(result.finishedAt)}</span></>}</div></div>{result.evidenceSuppressed && <Alert tone="warning" title="Evidence suppressed."><p>{evidenceReason(result.evidenceSuppressionReason, 'suppression')}</p></Alert>}{resultGuidance && <Alert tone="danger" title={`${resultGuidance.title}.`}><p>{resultGuidance.detail}</p><p><strong>Recommended recovery:</strong> {resultGuidance.recovery}</p>{!repeatedCategory && <p className="muted">Category: {result.errorCategory}</p>}</Alert>}{result.errorMessage && <p className="form-error" role="alert">{result.errorMessage}</p>}<ol className="step-results">{result.steps.map(step => <li className={step.status !== 'PASSED' ? 'step-failed' : ''} key={step.position}><span>{formatInteger(step.position + 1)}. {step.action}</span><span className="muted">{step.status}{step.durationMs !== undefined ? ` · ${formatInteger(step.durationMs)} ms` : ''}{step.errorMessage ? ` · ${step.errorMessage}` : ''}</span></li>)}</ol></article>
    }) : <EmptyState title="No case results" description="The worker has not reported case results yet." />}</Card>
    {execution.artifacts.length > 0 && <Card><h2>Artifacts</h2>{artifactError && <Alert tone="danger" title="Unable to load artifact."><div className="inline-actions"><span>{artifactError}</span>{failedArtifact && <Button type="button" variant="secondary" className="link-button" onClick={() => void loadArtifact(failedArtifact)} busy={artifactPending === failedArtifact.id}>Try again</Button>}</div></Alert>}<ul className="resource-list">{execution.artifacts.map(artifact => {
      const unavailable = artifactUnavailable(artifact, artifact.caseResultId ? caseResultsById.get(artifact.caseResultId) : undefined, unavailableArtifactIds.has(artifact.id))
      const artifactLabel = artifact.type === 'TRACE' ? artifact.downloadFilename : artifact.stepPosition === undefined ? 'Screenshot evidence' : `Screenshot evidence · step ${artifact.stepPosition + 1}`
      return <li key={artifact.id}><span className="execution-artifact-copy"><strong>{artifactLabel}</strong><br /><span className="muted">{artifact.type} · {formatKilobytes(artifact.byteSize)} · created {formatDateTime(artifact.createdAt)}{artifact.purgedAt ? ` · purged ${formatDateTime(artifact.purgedAt)}` : ''}</span>{unavailable && <><br /><span className="muted">{unavailable.label}: {unavailable.detail}</span></>}</span>{unavailable ? <StatusBadge status="neutral">Unavailable</StatusBadge> : <Button type="button" variant="ghost" className="link-button" onClick={() => void loadArtifact(artifact)} busy={artifactPending === artifact.id}>{artifact.type === 'TRACE' ? 'Download trace' : 'Preview screenshot'}</Button>}</li>
    })}</ul></Card>}
    {preview && <ScreenshotPreviewDialog label={preview.label} url={preview.url} onClose={closePreview} />}
  </section>
}
