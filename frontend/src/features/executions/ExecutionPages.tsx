import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiBlobFetch } from '../../lib/api'
import { projectKeys, projectsApi, type Execution } from '../projects/api'

const terminal = new Set(['PASSED', 'FAILED', 'ERROR', 'CANCELLED'])

export function ExecutionsPage() {
  const { projectId = '' } = useParams()
  const query = useQuery({ queryKey: projectKeys.executions(projectId), queryFn: () => projectsApi.executions(projectId), refetchInterval: 2000 })
  if (query.isPending) return <div className="card">Loading executions…</div>
  if (query.isError) return <div className="card form-error">{query.error instanceof ApiError ? query.error.message : 'Unable to load executions.'}</div>
  return <section className="page-stack"><div className="page-heading"><div><p className="eyebrow">Execution history</p><h1>Runs</h1><p className="lede">Track queued, running, and completed browser checks.</p></div><Link className="button secondary" to={`/projects/${projectId}`}>Back to project</Link></div><div className="card"><ExecutionTable executions={query.data} projectId={projectId} /></div></section>
}

function ExecutionTable({ executions, projectId }: { executions: Execution[]; projectId: string }) {
  if (!executions.length) return <p className="muted">No executions yet. Queue a suite or case to start a run.</p>
  return <div className="table-scroll"><table><thead><tr><th>Status</th><th>Created</th><th>Progress</th><th>Result</th></tr></thead><tbody>{executions.map(execution => <tr key={execution.id}><td><Link to={`/projects/${projectId}/executions/${execution.id}`}>{execution.status}</Link></td><td>{new Date(execution.createdAt).toLocaleString()}</td><td>{execution.completedCases}/{execution.totalCases}</td><td>{execution.passedCases} passed · {execution.failedCases} failed</td></tr>)}</tbody></table></div>
}

export function ExecutionDetailPage() {
  const { projectId = '', executionId = '' } = useParams()
  const client = useQueryClient(); const navigate = useNavigate()
  const query = useQuery({ queryKey: projectKeys.execution(projectId, executionId), queryFn: () => projectsApi.execution(projectId, executionId), refetchInterval: data => data.state.data && terminal.has(data.state.data.status) ? false : 2000 })
  const cancel = useMutation({ mutationFn: () => projectsApi.cancelExecution(projectId, executionId), onSuccess: () => client.invalidateQueries({ queryKey: projectKeys.execution(projectId, executionId) }) })
  if (query.isPending) return <div className="card">Loading execution…</div>
  if (query.isError || !query.data) return <div className="card form-error">Unable to load this execution.</div>
  const execution = query.data
  return <section className="page-stack"><div className="page-heading"><div><p className="eyebrow">Execution</p><h1>{execution.status}</h1><p className="lede">{execution.completedCases} of {execution.totalCases} cases complete.</p></div><div className="inline-actions"><button className="secondary" onClick={() => navigate(-1)}>Back</button>{!terminal.has(execution.status) && <button className="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel run</button>}</div></div><div className="card progress-card"><strong>{execution.passedCases} passed</strong><strong>{execution.failedCases} failed</strong><strong>{execution.errorCases} errors</strong><strong>{execution.cancelledCases} cancelled</strong></div><div className="card"><h2>Case results</h2>{execution.cases.map(result => <article className="result-card" key={result.id}><div className="result-heading"><div><h3>{result.caseName}</h3><span className="muted">{result.status} · {result.attemptCount} attempt(s)</span></div></div>{result.errorMessage && <p className="form-error">{result.errorMessage}</p>}<ol className="step-results">{result.steps.map(step => <li key={step.position}><span>{step.action}</span><span className="muted">{step.status}{step.durationMs ? ` · ${step.durationMs} ms` : ''}</span></li>)}</ol></article>)}</div>{execution.artifacts.length > 0 && <div className="card"><h2>Artifacts</h2><ul className="resource-list">{execution.artifacts.map(artifact => <li key={artifact.id}><span>{artifact.type} · {Math.ceil(artifact.byteSize / 1024)} KB</span><button className="link-button" onClick={() => void downloadArtifact(projectId, execution.id, artifact.id, artifact.type)}>{artifact.type === 'TRACE' ? 'Download trace' : 'Download screenshot'}</button></li>)}</ul></div>}</section>
}

async function downloadArtifact(projectId: string, executionId: string, artifactId: string, type: string) { const blob = await apiBlobFetch(`/api/v1/projects/${projectId}/executions/${executionId}/artifacts/${artifactId}`); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${type.toLowerCase()}-${artifactId}`; link.click(); URL.revokeObjectURL(url) }
