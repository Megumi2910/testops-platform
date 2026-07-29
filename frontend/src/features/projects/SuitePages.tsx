import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Alert, Button, Card, EmptyState, LoadingState, StatusBadge } from '../../components/ui'
import { projectKeys, projectsApi, type Suite } from './api'
import { useProjectWorkspace } from './ProjectWorkspaceContext'

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
        <label>Suite name<input aria-label="Suite name" placeholder="Checkout smoke…" {...form.register('name')} /></label>
        <label>Description<input aria-label="Suite description" placeholder="What does this suite cover…" {...form.register('description')} /></label>
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
  const canManage = project.permissions.includes('DEFINITION_MANAGE') && project.status === 'ACTIVE'
  const canRun = project.permissions.includes('EXECUTION_START') && project.status === 'ACTIVE'
  const query = useQuery({ queryKey: projectKeys.cases(projectId, suiteId), queryFn: () => projectsApi.cases(projectId, suiteId) })
  const run = useMutation({
    mutationFn: () => projectsApi.queueSuite(projectId, suiteId),
    onSuccess: result => {
      void client.invalidateQueries({ queryKey: projectKeys.executions(projectId) })
      navigate(`/projects/${projectId}/executions/${result.executionId}`)
    },
  })

  return <Card>
    <p className="eyebrow">Suite</p>
    <div className="page-heading compact">
      <div><h2>Test cases</h2><p className="muted">Only READY cases are included when you run a suite.</p></div>
      <div className="inline-actions">
        {canRun && <Button onClick={() => run.mutate()} busy={run.isPending}>Run ready cases</Button>}
        <Link className="button button-secondary" to={`/projects/${projectId}/executions`}>Runs</Link>
        {canManage && <Link className="button button-secondary" to={`/projects/${projectId}/suites/${suiteId}/cases/new`}>New case</Link>}
      </div>
    </div>
    {run.isError && <Alert tone="danger" title="Unable to queue this suite run.">Make sure the suite contains at least one READY case.</Alert>}
    {query.isPending && <LoadingState label="Loading test cases…" />}
    {query.isError && <Alert tone="danger" title="Unable to load test cases.">Try again after the backend is ready.</Alert>}
    {query.data?.length
      ? <ul className="resource-list">{query.data.map(testCase => <li key={testCase.id}>
          <Link to={`/projects/${projectId}/suites/${suiteId}/cases/${testCase.id}`}>{testCase.name}</Link>
          <StatusBadge status={testCase.status === 'READY' ? 'success' : 'neutral'}>{testCase.status} · {testCase.priority}</StatusBadge>
        </li>)}</ul>
      : query.data
        ? <EmptyState title="No cases yet" description={canManage ? 'Create a case from a template or start with a blank case.' : 'A test manager can create the first case.'} action={canManage && <Link className="button" to={`/projects/${projectId}/suites/${suiteId}/cases/new`}>Create first case</Link>} />
        : null}
  </Card>
}
