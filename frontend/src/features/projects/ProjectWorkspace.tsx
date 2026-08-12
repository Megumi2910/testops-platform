import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Alert, Button, Card, ConfirmDialog, LoadingState, PageHeader, StatusBadge } from '../../components/ui'
import { projectKeys, projectsApi } from './api'
import { buildOnboardingChecklist, targetHealthGuidance, useProjectWorkspace, type ProjectWorkspaceContext } from './ProjectWorkspaceContext'

export function ProjectLayout() {
  const { projectId = '' } = useParams()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const client = useQueryClient()
  const query = useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => projectsApi.get(projectId),
    enabled: Boolean(projectId),
  })
  const archive = useMutation({
    mutationFn: () => projectsApi.archive(projectId, query.data?.version ?? 0),
    onSuccess: project => {
      setArchiveOpen(false)
      client.setQueryData(projectKeys.detail(projectId), project)
      void client.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
  const restore = useMutation({
    mutationFn: () => projectsApi.restore(projectId, query.data?.version ?? 0),
    onSuccess: project => {
      setRestoreOpen(false)
      client.setQueryData(projectKeys.detail(projectId), project)
      void client.invalidateQueries({ queryKey: projectKeys.all })
    },
  })

  if (!projectId) return <Navigate to="/projects" replace />
  if (query.isPending) return <Card><LoadingState label="Loading project…" /></Card>
  if (query.isError || !query.data) {
    return <Alert tone="danger" title="Unable to load this project.">Return to projects and try again.</Alert>
  }

  const project = query.data
  const root = `/projects/${projectId}`
  return <section className="page-stack">
    <PageHeader
      eyebrow="Project"
      title={project.name}
      description={project.description || 'Build and maintain reliable browser checks.'}
      actions={<>
        <Link className="button button-secondary" to="/projects">All projects</Link>
        {project.permissions.includes('PROJECT_ARCHIVE') && project.status === 'ACTIVE' &&
          <Button variant="danger" onClick={() => setArchiveOpen(true)} disabled={archive.isPending}>Archive</Button>}
        {project.permissions.includes('PROJECT_ARCHIVE') && project.status === 'ARCHIVED' &&
          <Button onClick={() => setRestoreOpen(true)} disabled={restore.isPending}>Restore project</Button>}
      </>}
    />
    <Card className="project-summary">
      <p><strong>Target:</strong> <span className="break-words">{project.targetOrigin}</span></p>
      <p><strong>Status:</strong> <StatusBadge status={project.status === 'ACTIVE' ? 'success' : 'neutral'}>{project.status}</StatusBadge></p>
      <p><strong>Role:</strong> {project.currentUserProjectRole || 'ADMIN'}</p>
      <p><strong>Target health:</strong> <StatusBadge status={project.targetHealth?.status === 'REACHABLE' ? 'success' : project.targetHealth?.status === 'UNREACHABLE' ? 'danger' : 'warning'}>{project.targetHealth?.status ?? 'NOT_CHECKED'}</StatusBadge>{project.targetHealth?.checkedAt ? ` · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(project.targetHealth.checkedAt))}` : ''}</p>
    </Card>
    <nav className="subnav" aria-label="Project sections">
      <NavLink end to={root}>Overview</NavLink>
      {project.permissions.includes('DEFINITION_VIEW') && <NavLink to={`${root}/suites`}>Suites</NavLink>}
      {project.permissions.includes('DEFINITION_VIEW') && <NavLink to={`${root}/trash`}>Trash</NavLink>}
      {project.permissions.includes('VARIABLE_VIEW') && <NavLink to={`${root}/variables`}>Variables</NavLink>}
      {project.permissions.includes('MEMBER_MANAGE') && <NavLink to={`${root}/members`}>Members</NavLink>}
      <NavLink to={`${root}/executions`}>Executions</NavLink>
    </nav>
    <Outlet context={{ project, root } satisfies ProjectWorkspaceContext} />
    <ConfirmDialog
      open={archiveOpen}
      title={`Archive ${project.name}?`}
      description="Archived projects are no longer available for new runs. You can restore this state later from project administration."
      confirmLabel="Archive project"
      busy={archive.isPending}
      onClose={() => setArchiveOpen(false)}
      onConfirm={() => archive.mutate()}
    />
    <ConfirmDialog
      open={restoreOpen}
      title={`Restore ${project.name}?`}
      description="The project becomes active again. Its definitions keep their current lifecycle states."
      confirmLabel="Restore project"
      confirmVariant="primary"
      busy={restore.isPending}
      onClose={() => setRestoreOpen(false)}
      onConfirm={() => restore.mutate()}
    />
  </section>
}

export function ProjectOverviewPage() {
  const { project, root } = useProjectWorkspace()
  const client = useQueryClient()
  const check = useMutation({
    mutationFn: () => projectsApi.targetCheck(project.id),
    onSuccess: () => client.invalidateQueries({ queryKey: projectKeys.detail(project.id) }),
  })
  const canCheck = project.permissions.includes('EXECUTION_START')
  const checklist = buildOnboardingChecklist(project, root)
  const healthGuidance = targetHealthGuidance(project)

  return <section className="page-stack">
    <Card className="quick-start">
      <div className="page-heading compact">
        <div>
          <p className="eyebrow">Quick start</p>
          <h2>From target to first browser run</h2>
          <p className="muted">Complete these steps to validate your local website safely.</p>
        </div>
        <div className="inline-actions">
          <a className="button button-secondary" href={project.targetOrigin} target="_blank" rel="noreferrer">Open target</a>
          {canCheck && <Button type="button" busy={check.isPending} onClick={() => check.mutate()}>Check connection</Button>}
        </div>
      </div>
      {check.isSuccess && <Alert tone="success" title="Connection check completed.">Target health has been refreshed.</Alert>}
      {check.isError && <Alert tone="danger" title="The target could not be reached.">Confirm the host alias, port, and allowlist.</Alert>}
      {healthGuidance && <Alert tone={healthGuidance.tone} title={healthGuidance.title}>
        <p>{healthGuidance.body}</p>
        {healthGuidance.details && <p><code>{healthGuidance.details}</code></p>}
        {project.targetOrigin.toLowerCase().startsWith('http://localhost:') && <p><a href="https://github.com/Megumi2910/testops-platform/blob/codex/milestone-9-release-candidate/docs/operations/12-local-target-testing-guide.md" target="_blank" rel="noreferrer">Read the local-target setup guide</a> after updating the backend environment.</p>}
      </Alert>}
      <ol className="checklist">
        {checklist.map(item => <li key={item.label} className={item.done ? 'done' : ''}>
          <span aria-hidden="true">{item.done ? '✓' : '○'}</span>
          {item.done ? <span>{item.label}</span> : item.external
            ? <a href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
            : <Link to={item.href}>{item.label}</Link>}
        </li>)}
      </ol>
      <p className="form-help">Case authoring requires a first NAVIGATE step. A READY case must have at least one step before it can run.</p>
    </Card>
  </section>
}
