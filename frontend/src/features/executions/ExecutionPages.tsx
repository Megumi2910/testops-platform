import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiBlobFetch } from '../../lib/api'
import { projectKeys, projectsApi, type ExecutionSummary } from '../projects/api'
import { Alert, Button, Card, EmptyState, LoadingState, PageHeader, StatusBadge } from '../../components/ui'
import { getExecutionFailureGuidance } from './executionGuidance'

const terminal = new Set(['PASSED', 'FAILED', 'ERROR', 'CANCELLED'])

function ArtifactPreview({ name, url, onClose }: { name?: string; url: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'Tab') {
        event.preventDefault()
        closeRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus.current?.focus()
    }
  }, [onClose])

  return <div className="artifact-preview" role="dialog" aria-modal="true" aria-labelledby="artifact-preview-title"><div className="section-heading"><h3 id="artifact-preview-title">{name}</h3><button ref={closeRef} className="link-button" type="button" onClick={onClose}>Close preview</button></div><img src={url} alt="Execution screenshot" width="1280" height="720" /></div>
}

export function ExecutionsPage() {
  const { projectId = '' } = useParams()
  const query = useQuery({ queryKey: projectKeys.executions(projectId), queryFn: () => projectsApi.executions(projectId), refetchInterval: state => state.state.data?.some(execution => !terminal.has(execution.status)) ? 2000 : false })
  if (query.isPending) return <Card><LoadingState label="Loading executions…" /></Card>
  if (query.isError) return <Alert tone="danger" title="Unable to load executions."><div className="inline-actions"><span>{query.error instanceof ApiError ? query.error.message : 'Try again after the backend is ready.'}</span><Button type="button" variant="secondary" onClick={() => void query.refetch()} busy={query.isFetching}>Try again</Button></div></Alert>
  return <section className="page-stack"><PageHeader eyebrow="Execution history" title="Runs" description="Track queued, running, and completed browser checks." actions={<Link className="button button-secondary" to={`/projects/${projectId}`}>Back to project</Link>} /><Card><ExecutionTable executions={query.data} projectId={projectId} /></Card></section>
}

function ExecutionTable({ executions, projectId }: { executions: ExecutionSummary[]; projectId: string }) {
  if (!executions.length) return <EmptyState title="No runs yet" description="Create a READY case, then queue it from its suite." action={<Link className="button" to={`/projects/${projectId}/suites`}>Open suites</Link>} />
  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return <div className="table-scroll"><table><caption className="sr-only">Execution history</caption><thead><tr><th>Status</th><th>Created</th><th>Progress</th><th>Result</th></tr></thead><tbody>{executions.map(execution => <tr key={execution.id}><td><Link className="table-status" to={`/projects/${projectId}/executions/${execution.id}`}><StatusBadge status={execution.status === 'PASSED' ? 'success' : execution.status === 'FAILED' || execution.status === 'ERROR' ? 'danger' : 'info'}>{execution.status}</StatusBadge></Link></td><td>{dateFormatter.format(new Date(execution.createdAt))}</td><td className="tabular-nums">{execution.completedCases}/{execution.totalCases}</td><td className="tabular-nums">{execution.passedCases} passed · {execution.failedCases} failed</td></tr>)}</tbody></table></div>
}

export function ExecutionDetailPage() {
  const { projectId = '', executionId = '' } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient(); const [previewUrl, setPreviewUrl] = useState<string>(); const [previewName, setPreviewName] = useState<string>(); const [artifactError, setArtifactError] = useState<string>(); const [artifactPending, setArtifactPending] = useState<string>(); const [failedArtifact, setFailedArtifact] = useState<{ id: string; type: string }>()
  const closePreview = useCallback(() => setPreviewUrl(undefined), [])
  const projectQuery = useQuery({ queryKey: projectKeys.detail(projectId), queryFn: () => projectsApi.get(projectId), staleTime: 30_000, enabled: Boolean(projectId) })
  const query = useQuery({ queryKey: projectKeys.execution(projectId, executionId), queryFn: () => projectsApi.execution(projectId, executionId), refetchInterval: data => data.state.data && terminal.has(data.state.data.status) ? false : 2000 })
  const cancel = useMutation({ mutationFn: () => projectsApi.cancelExecution(projectId, executionId), onSuccess: () => client.invalidateQueries({ queryKey: projectKeys.execution(projectId, executionId) }) })
  const runAgain = useMutation({
    mutationFn: (suiteId: string) => projectsApi.queueSuite(projectId, suiteId),
    onSuccess: result => {
      void client.invalidateQueries({ queryKey: projectKeys.executions(projectId) })
      navigate(`/projects/${projectId}/executions/${result.executionId}`)
    },
  })
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
  if (query.isPending) return <Card><LoadingState label="Loading execution…" /></Card>
  if (query.isError || !query.data) return <Alert tone="danger" title="Unable to load this execution."><div className="inline-actions"><span>Return to runs and try again.</span><Button type="button" variant="secondary" onClick={() => void query.refetch()} busy={query.isFetching}>Try again</Button></div></Alert>
  const execution = query.data
  const canRunAgain = Boolean(execution.suiteId && projectQuery.data?.status === 'ACTIVE' && projectQuery.data.permissions.includes('EXECUTION_START'))
  const loadArtifact = async (artifactId: string, type: string) => {
    setArtifactPending(artifactId)
    setArtifactError(undefined)
    setFailedArtifact(undefined)
    try {
      const blob = await apiBlobFetch(`/api/v1/projects/${projectId}/executions/${execution.id}/artifacts/${artifactId}`)
      if (type === 'SCREENSHOT') {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(URL.createObjectURL(blob))
        setPreviewName(`Screenshot ${execution.id}`)
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `trace-${artifactId}.zip`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      setFailedArtifact({ id: artifactId, type })
      setArtifactError('The artifact could not be loaded. It may have expired or the server may be unavailable.')
    } finally {
      setArtifactPending(current => current === artifactId ? undefined : current)
    }
  }
  const infrastructureGuidance = execution.infrastructureErrorCategory ? getExecutionFailureGuidance(execution.infrastructureErrorCategory) : undefined
  return <section className="page-stack"><PageHeader eyebrow="Execution" title={execution.status} description={`${execution.completedCases} of ${execution.totalCases} cases complete.`} actions={<div className="inline-actions"><Link className="button button-secondary" to={`/projects/${projectId}/executions`}>Back to runs</Link>{canRunAgain && <Button onClick={() => runAgain.mutate(execution.suiteId!)} busy={runAgain.isPending}>Run current suite again</Button>}{!terminal.has(execution.status) && <Button variant="danger" onClick={() => cancel.mutate()} busy={cancel.isPending}>Cancel run</Button>}</div>} />{runAgain.isError && <Alert tone="danger" title="Unable to queue the suite again."><div className="inline-actions"><span>{runAgain.error instanceof ApiError ? runAgain.error.message : 'The suite may be archived or have no READY cases.'}</span><Button type="button" variant="secondary" onClick={() => runAgain.mutate(execution.suiteId!)} busy={runAgain.isPending}>Try again</Button></div></Alert>}{cancel.isError && <Alert tone="danger" title="Unable to cancel this run."><div className="inline-actions"><span>{cancel.error instanceof ApiError ? cancel.error.message : 'The worker may have completed the run already.'}</span><Button type="button" variant="secondary" onClick={() => cancel.mutate()} busy={cancel.isPending}>Try again</Button></div></Alert>}<Card className="progress-card"><StatusBadge status="success">{execution.passedCases} passed</StatusBadge><StatusBadge status="danger">{execution.failedCases} failed</StatusBadge><StatusBadge status="warning">{execution.errorCases} errors</StatusBadge><StatusBadge status="neutral">{execution.cancelledCases} cancelled</StatusBadge></Card>{infrastructureGuidance && <Alert tone="danger" title={`${infrastructureGuidance.title}.`}><p>{infrastructureGuidance.detail}</p><p><strong>Recommended recovery:</strong> {infrastructureGuidance.recovery}</p><p className="muted">Category: {execution.infrastructureErrorCategory}</p></Alert>}<Card><h2>Case results</h2>{execution.cases.length ? execution.cases.map(result => { const resultGuidance = result.errorCategory ? getExecutionFailureGuidance(result.errorCategory) : undefined; const repeatedCategory = result.errorCategory && result.errorCategory === execution.infrastructureErrorCategory; return <article className="result-card" key={result.id}><div className="result-heading"><div><h3>{result.caseName}</h3><span className="muted"><StatusBadge status={result.status === 'PASSED' ? 'success' : 'danger'}>{result.status}</StatusBadge> · {result.attemptCount} attempt(s){result.failedStepPosition !== undefined ? ` · failed at step ${result.failedStepPosition + 1}` : ''}</span></div></div>{resultGuidance && <Alert tone="danger" title={`${resultGuidance.title}.`}><p>{resultGuidance.detail}</p><p><strong>Recommended recovery:</strong> {resultGuidance.recovery}</p>{!repeatedCategory && <p className="muted">Category: {result.errorCategory}</p>}</Alert>}{result.errorMessage && <p className="form-error" role="alert">{result.errorMessage}</p>}<ol className="step-results">{result.steps.map(step => <li className={step.status !== 'PASSED' ? 'step-failed' : ''} key={step.position}><span>{step.position + 1}. {step.action}</span><span className="muted">{step.status}{step.durationMs !== undefined ? ` · ${step.durationMs} ms` : ''}{step.errorMessage ? ` · ${step.errorMessage}` : ''}</span></li>)}</ol></article> }) : <EmptyState title="No case results" description="The worker has not reported case results yet." />}</Card>{execution.artifacts.length > 0 && <Card><h2>Artifacts</h2>{artifactError && <Alert tone="danger" title="Unable to load artifact."><div className="inline-actions"><span>{artifactError}</span>{failedArtifact && <Button type="button" variant="secondary" className="link-button" onClick={() => void loadArtifact(failedArtifact.id, failedArtifact.type)} busy={artifactPending === failedArtifact.id}>Try again</Button>}</div></Alert>}<ul className="resource-list">{execution.artifacts.map(artifact => <li key={artifact.id}><span>{artifact.type}{artifact.stepPosition !== undefined ? ` · step ${artifact.stepPosition + 1}` : ''} · {Math.ceil(artifact.byteSize / 1024)} KB</span><Button type="button" variant="ghost" className="link-button" onClick={() => void loadArtifact(artifact.id, artifact.type)} busy={artifactPending === artifact.id}>{artifact.type === 'TRACE' ? 'Download trace' : 'Preview screenshot'}</Button></li>)}</ul>{previewUrl && <ArtifactPreview name={previewName} url={previewUrl} onClose={closePreview} />}</Card>}</section>
}
