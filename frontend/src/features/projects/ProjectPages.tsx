import { useDeferredValue, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../../lib/api'
import { platformApi, projectKeys, projectsApi, type Project } from './api'
import { useProjectWorkspace } from './ProjectWorkspaceContext'
import { Alert, Button, Card, EmptyState, LoadingState, PageHeader } from '../../components/ui'
import { ProjectErrorAlert } from './ProjectErrorAlert'

const projectSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().max(2000).optional(), targetOrigin: z.string().url() })
type ProjectForm = z.infer<typeof projectSchema>

export function ProjectsPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''
  const page = Math.max(0, Number(searchParams.get('page') ?? '0') || 0)
  const deferredSearch = useDeferredValue(search)
  const canCreate = user?.platformPermissions?.includes('PROJECT_CREATE') ?? false
  const query = useQuery({
    queryKey: projectKeys.list(`${deferredSearch}:${page}`),
    queryFn: () => projectsApi.list({ query: deferredSearch, page }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
  const options = useQuery({ queryKey: ['platform', 'options'], queryFn: platformApi.options, staleTime: 60_000 })
  const updateSearch = (value: string) => setSearchParams(value ? { q: value } : {})
  const updatePage = (nextPage: number) => setSearchParams(value => { value.set('page', String(nextPage)); return value })
  return <section className="page-stack">
    <PageHeader eyebrow="Workspace" title="Projects" description="Organize targets, test suites, and reusable variables." actions={canCreate && <Link className="button" to="/projects/new">New project</Link>} />
    {canCreate && options.data && !options.data.targetConfigured && <Alert tone="warning" title="Project creation needs setup.">Set <code>TARGET_ALLOWED_ORIGINS</code> in the backend environment, then recreate the backend container. <Link className="inline-link" to="/projects/new">View setup details</Link></Alert>}
    {options.isError && canCreate && <ProjectErrorAlert title="Project setup could not be checked." error={options.error} fallback="You can retry after the backend is ready." onRetry={() => void options.refetch()} />}
    <label className="search-field" htmlFor="project-search">Filter projects<input id="project-search" name="q" value={search} onChange={event => updateSearch(event.target.value)} placeholder="Search by name…" autoComplete="off" /></label>
    {query.isPending && <Card><LoadingState label="Loading projects…" /></Card>}
    {query.isError && <ProjectErrorAlert title="Unable to load projects." error={query.error} fallback="Try again when the backend is ready." onRetry={() => void query.refetch()} />}
    <div className="project-grid">{query.data?.content.map(project => <ProjectCard key={project.id} project={project} />)}</div>
    {query.data && query.data.content.length === 0 && <Card><EmptyState title={search ? 'No matching projects' : 'No projects yet'} description={search ? 'Try a different project name.' : 'Create your first project to start organizing targets and suites.'} action={canCreate && <Link className="button" to="/projects/new">Create a project</Link>} /></Card>}
    {query.data && query.data.totalPages > 1 && <nav className="pagination" aria-label="Project pages"><Button variant="secondary" type="button" onClick={() => updatePage(page - 1)} disabled={page === 0}>Previous</Button><span aria-live="polite">Page {page + 1} of {query.data.totalPages}</span><Button variant="secondary" type="button" onClick={() => updatePage(page + 1)} disabled={page + 1 >= query.data.totalPages}>Next</Button></nav>}
  </section>
}

function ProjectCard({ project }: { project: Project }) { return <Link className="card project-card" to={`/projects/${project.id}`}><div><p className="eyebrow">{project.status}</p><h2>{project.name}</h2><p>{project.description || 'No description yet.'}</p></div><span className="muted">{project.targetOrigin}</span></Link> }

export function NewProjectPage() {
  const navigate = useNavigate(); const client = useQueryClient()
  const options = useQuery({ queryKey: ['platform', 'options'], queryFn: platformApi.options })
  const form = useForm<ProjectForm>({ resolver: zodResolver(projectSchema), defaultValues: { name: '', description: '', targetOrigin: '' } })
  const mutation = useMutation({ mutationFn: projectsApi.create, onSuccess: project => { client.invalidateQueries({ queryKey: projectKeys.all }); navigate(`/projects/${project.id}`) } })
  if (options.isPending) return <section className="card"><LoadingState label="Loading project setup…" /></section>
  if (options.isError) return <section className="card"><PageHeader eyebrow="Projects" title="Project setup unavailable" description="The backend did not return the project configuration." /><ProjectErrorAlert title="Unable to load project setup." error={options.error} fallback="The backend did not return the project configuration." onRetry={() => void options.refetch()} /><Link className="button button-secondary" to="/projects">Back to projects</Link></section>
  if (!options.data?.targetConfigured) return <section className="card" role="alert"><PageHeader eyebrow="Projects" title="Project setup required" description="An administrator must set TARGET_ALLOWED_ORIGINS to at least one safe HTTP(S) origin before projects can be created." /><Link className="button button-secondary" to="/projects">Back to projects</Link></section>
  if (!options.data.projectCreationEnabled) return <section className="card" role="alert"><PageHeader eyebrow="Projects" title="Project creation is restricted" description="Your account must be active and email verified before it can create a project." /><Link className="button button-secondary" to="/projects">Back to projects</Link></section>
  const origins = options.data.targetOrigins ?? options.data.targetAllowedOrigins.map(origin => ({ origin, type: 'EXTERNAL' as const, usable: true }))
  return <section className="card auth-card"><PageHeader eyebrow="Projects" title="Create project" description="Register a safe target before adding suites and browser checks." /><form className="form-stack" onSubmit={form.handleSubmit(values => mutation.mutate(values))}><Field label="Name" error={form.formState.errors.name?.message} errorId="new-project-name-error"><input autoComplete="off" aria-invalid={Boolean(form.formState.errors.name)} aria-describedby={form.formState.errors.name ? 'new-project-name-error' : undefined} {...form.register('name')} /></Field><Field label="Description" error={form.formState.errors.description?.message} errorId="new-project-description-error"><textarea autoComplete="off" aria-invalid={Boolean(form.formState.errors.description)} aria-describedby={form.formState.errors.description ? 'new-project-description-error' : undefined} {...form.register('description')} rows={4} /></Field><Field label="Target origin" help="Choose an origin from the deployment allowlist. Disabled entries explain why they cannot be used." error={form.formState.errors.targetOrigin?.message} errorId="new-project-origin-error"><select autoComplete="off" aria-invalid={Boolean(form.formState.errors.targetOrigin)} aria-describedby={form.formState.errors.targetOrigin ? 'new-project-origin-error' : undefined} {...form.register('targetOrigin')}><option value="">Select target origin</option>{origins.map(origin => <option key={origin.origin} value={origin.origin} disabled={!origin.usable}>{origin.origin}{origin.usable ? '' : ` — ${origin.blockedReason ?? 'Unavailable'}`}</option>)}</select></Field>{mutation.isError && <ProjectErrorAlert title="Unable to create project." error={mutation.error} fallback="Review the project details and try again." busy={mutation.isPending} onRetry={() => void form.handleSubmit(values => mutation.mutate(values))()} /> }<div className="inline-actions"><Button type="submit" busy={mutation.isPending}>{mutation.isPending ? 'Creating…' : 'Create project'}</Button><Link className="button button-secondary" to="/projects">Cancel</Link></div></form></section>
}

export function EditProjectPage() {
  const { project, root } = useProjectWorkspace()
  const navigate = useNavigate()
  const client = useQueryClient()
  const form = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: project.name, description: project.description ?? '', targetOrigin: project.targetOrigin },
  })
  const mutation = useMutation({
    mutationFn: (values: ProjectForm) => projectsApi.update(project.id, { ...values, projectVersion: project.version }),
    onSuccess: updated => {
      client.setQueryData(projectKeys.detail(project.id), updated)
      void client.invalidateQueries({ queryKey: projectKeys.all })
      navigate(root)
    },
  })
  const reload = useMutation({
    mutationFn: () => projectsApi.get(project.id),
    onSuccess: latest => {
      client.setQueryData(projectKeys.detail(project.id), latest)
      form.reset({ name: latest.name, description: latest.description ?? '', targetOrigin: latest.targetOrigin })
      mutation.reset()
    },
  })

  if (project.status === 'ARCHIVED' || !project.permissions.includes('PROJECT_UPDATE')) {
    return <section className="card" role="alert">
      <PageHeader eyebrow="Projects" title="Project editing is unavailable" description={project.status === 'ARCHIVED' ? 'Archived projects are read-only until they are restored.' : 'Your project role cannot edit this project.'} />
      <Link className="button button-secondary" to={root}>Back to project</Link>
    </section>
  }

  const errorMessage = mutation.error instanceof ApiError
    ? mutation.error.code === 'project_name_taken'
      ? 'An active project already uses this name.'
      : mutation.error.code === 'stale_version'
        ? 'This project changed in another tab. Reload the project before saving again.'
        : mutation.error.code === 'project_archived'
          ? 'This project was archived and is now read-only.'
          : mutation.error.message
    : 'Unable to save project changes.'
  const staleVersion = mutation.error instanceof ApiError && mutation.error.code === 'stale_version'

  return <section className="card auth-card">
    <PageHeader eyebrow="Projects" title="Edit project" description="Update the project identity and its approved target origin." />
    <form className="form-stack" aria-busy={reload.isPending} onSubmit={form.handleSubmit(values => mutation.mutate(values))}>
      <Field label="Name" error={form.formState.errors.name?.message} errorId="edit-project-name-error"><input autoComplete="off" disabled={reload.isPending} aria-invalid={Boolean(form.formState.errors.name)} aria-describedby={form.formState.errors.name ? 'edit-project-name-error' : undefined} {...form.register('name')} /></Field>
      <Field label="Description" error={form.formState.errors.description?.message} errorId="edit-project-description-error"><textarea autoComplete="off" disabled={reload.isPending} aria-invalid={Boolean(form.formState.errors.description)} aria-describedby={form.formState.errors.description ? 'edit-project-description-error' : undefined} {...form.register('description')} rows={4} /></Field>
      <Field label="Target origin" help="The origin must remain in the backend allowlist." error={form.formState.errors.targetOrigin?.message} errorId="edit-project-origin-error"><input type="url" autoComplete="off" disabled={reload.isPending} aria-invalid={Boolean(form.formState.errors.targetOrigin)} aria-describedby={form.formState.errors.targetOrigin ? 'edit-project-origin-error' : undefined} {...form.register('targetOrigin')} /></Field>
      {mutation.isError && <ProjectErrorAlert title="Unable to save project changes." error={mutation.error} fallback="Unable to save project changes." message={errorMessage} retryLabel={staleVersion ? 'Reload latest project' : 'Try save again'} busy={staleVersion ? reload.isPending : mutation.isPending} onRetry={staleVersion ? () => reload.mutate() : () => void form.handleSubmit(values => mutation.mutate(values))()} />}
      {reload.isError && <ProjectErrorAlert title="Unable to reload the project." error={reload.error} fallback="Your edits remain in this form." retryLabel="Retry reload" busy={reload.isPending} onRetry={() => reload.mutate()} />}
      <div className="inline-actions"><Button type="submit" busy={mutation.isPending} disabled={reload.isPending || staleVersion}>{mutation.isPending ? 'Saving…' : 'Save changes'}</Button><Link className="button button-secondary" to={root}>Cancel</Link></div>
    </form>
  </section>
}

function Field({ label, help, error, errorId, children }: { label: string; help?: string; error?: string; errorId?: string; children: ReactNode }) { return <label>{label}{children}{help && <small className="form-help">{help}</small>}{error && <small id={errorId} className="form-error">{error}</small>}</label> }
