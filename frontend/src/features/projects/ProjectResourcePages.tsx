import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, type FieldPath, type UseFormSetError } from 'react-hook-form'

import { Alert, Button, Card, ConfirmDialog, EmptyState, LoadingState, StatusBadge } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { platformApi, projectKeys, projectsApi, type Member, type Variable } from './api'
import { ProjectErrorAlert } from './ProjectErrorAlert'
import { useProjectWorkspace } from './ProjectWorkspaceContext'

type VariableFormValues = { key: string; secret: boolean; value: string }

function applyFieldErrors<T extends Record<string, unknown>>(error: unknown, setError: UseFormSetError<T>, fields: FieldPath<T>[]) {
  if (!(error instanceof ApiError)) return
  let shouldFocus = true
  fields.forEach(field => {
    const message = error.fieldErrors[field]
    if (!message) return
    setError(field, { message }, { shouldFocus })
    shouldFocus = false
  })
}

function staleVariableMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.code === 'stale_version') return 'This variable or project changed in another session. The latest data was reloaded; review it before trying again.'
  if (error instanceof ApiError && error.code === 'secret_variables_disabled') return 'Secret variables are disabled by server configuration. Plain variables remain available.'
  return error instanceof ApiError ? error.message : fallback
}

export function VariablesPage() {
  const { projectId = '' } = useParams()
  const { project, root } = useProjectWorkspace()
  const client = useQueryClient()
  const [editTarget, setEditTarget] = useState<Variable>()
  const [deleteTarget, setDeleteTarget] = useState<Variable>()
  const canView = project.permissions.includes('VARIABLE_VIEW')
  const canManage = canView && project.permissions.includes('VARIABLE_MANAGE') && project.status === 'ACTIVE'
  const variablesQuery = useQuery({
    queryKey: projectKeys.variables(projectId),
    queryFn: () => projectsApi.variables(projectId),
    enabled: canView,
  })
  const options = useQuery({
    queryKey: ['platform', 'options'],
    queryFn: platformApi.options,
    enabled: canManage,
    staleTime: 60_000,
  })
  const secretsEnabled = options.data?.secretVariablesEnabled === true
  const createForm = useForm<VariableFormValues>({ defaultValues: { key: '', secret: false, value: '' } })
  const editForm = useForm<{ value: string }>({ defaultValues: { value: '' } })

  const refreshResources = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: projectKeys.variables(projectId), exact: true }),
      client.invalidateQueries({ queryKey: projectKeys.detail(projectId), exact: true }),
    ])
  }
  const reloadResources = async () => {
    const [variables] = await Promise.all([
      variablesQuery.refetch(),
      client.refetchQueries({ queryKey: projectKeys.detail(projectId), exact: true }),
    ])
    return variables.data
  }

  const create = useMutation({
    mutationFn: (values: VariableFormValues) => projectsApi.createVariable(projectId, { ...values, projectVersion: project.version }),
    onSuccess: async () => {
      createForm.reset()
      await refreshResources()
    },
    onError: async error => {
      applyFieldErrors(error, createForm.setError, ['key', 'secret', 'value'])
      if (error instanceof ApiError && error.code === 'variable_exists') createForm.setError('key', { message: 'A variable with this key already exists.' }, { shouldFocus: true })
      if (error instanceof ApiError && error.code === 'stale_version') await reloadResources()
    },
  })
  const update = useMutation({
    mutationFn: ({ variable, value }: { variable: Variable; value: string }) => projectsApi.updateVariable(projectId, variable.key, {
      key: variable.key,
      secret: variable.secret,
      value,
      projectVersion: project.version,
      variableVersion: variable.version,
    }),
    onSuccess: async () => {
      setEditTarget(undefined)
      editForm.reset()
      await refreshResources()
    },
    onError: async error => {
      applyFieldErrors(error, editForm.setError, ['value'])
      if (error instanceof ApiError && error.code === 'stale_version' && editTarget) {
        const latest = (await reloadResources())?.find(variable => variable.key === editTarget.key)
        if (latest) {
          setEditTarget(latest)
          editForm.reset({ value: latest.secret ? '' : latest.value ?? '' }, { keepErrors: true })
        }
      }
    },
  })
  const remove = useMutation({
    mutationFn: (variable: Variable) => projectsApi.deleteVariable(projectId, variable.key, project.version, variable.version),
    onSuccess: async () => {
      setDeleteTarget(undefined)
      await refreshResources()
    },
    onError: async error => {
      if (error instanceof ApiError && error.code === 'stale_version' && deleteTarget) {
        const latest = (await reloadResources())?.find(variable => variable.key === deleteTarget.key)
        if (latest) setDeleteTarget(latest)
      }
    },
  })

  const startEditing = (variable: Variable) => {
    update.reset()
    setEditTarget(variable)
    editForm.reset({ value: variable.secret ? '' : variable.value ?? '' })
  }
  const submitCreate = (values: VariableFormValues) => {
    if (values.secret && !secretsEnabled) {
      createForm.setError('secret', { message: 'Secret variables are disabled by server configuration.' }, { shouldFocus: true })
      return
    }
    create.mutate(values)
  }

  if (!canView) return <section className="page-stack">
    <Alert tone="danger" title="Variables are restricted.">
      <p>Your project role does not include variable visibility.</p>
      <Link className="button button-secondary" to={`/projects/${projectId}`}>Back to project overview</Link>
    </Alert>
  </section>

  return <section className="page-stack">
    {canManage && <Card>
      <h2>Add variable</h2>
      <p className="form-help">Keys are normalized to uppercase. Secret values are write-only and always masked after saving.</p>
      {options.data && !secretsEnabled && <Alert tone="warning" title="Secret variables are unavailable.">An administrator must configure the server encryption key before secret variables can be created or edited. Plain variables remain available.</Alert>}
      {options.isError && <ProjectErrorAlert title="Unable to check secret-variable support." error={options.error} fallback="Secret creation is disabled until server support can be verified." onRetry={() => void options.refetch()} />}
      <form className="inline-form" onSubmit={createForm.handleSubmit(submitCreate)}>
        <label>Variable key
          <input aria-label="Variable key" autoComplete="off" placeholder="BASE_URL…" maxLength={64}
            aria-invalid={Boolean(createForm.formState.errors.key)} aria-describedby={createForm.formState.errors.key ? 'variable-key-error' : undefined}
            {...createForm.register('key', { required: 'Enter a variable key.', minLength: { value: 2, message: 'Use at least 2 characters.' }, pattern: { value: /^[A-Za-z][A-Za-z0-9_]+$/, message: 'Start with a letter and use only letters, numbers, or underscores.' } })} />
          {createForm.formState.errors.key?.message && <small id="variable-key-error" className="form-error">{createForm.formState.errors.key.message}</small>}
        </label>
        <label>Variable value
          <input aria-label="Variable value" autoComplete="off" placeholder="Value…" maxLength={10000} type={createForm.watch('secret') ? 'password' : 'text'}
            aria-invalid={Boolean(createForm.formState.errors.value)} aria-describedby={createForm.formState.errors.value ? 'variable-value-error' : undefined}
            {...createForm.register('value')} />
          {createForm.formState.errors.value?.message && <small id="variable-value-error" className="form-error">{createForm.formState.errors.value.message}</small>}
        </label>
        <label className="checkbox"><input type="checkbox" disabled={!secretsEnabled} aria-describedby={!secretsEnabled || createForm.formState.errors.secret ? 'variable-secret-help' : undefined} {...createForm.register('secret')} /> Secret</label>
        {(!secretsEnabled || createForm.formState.errors.secret?.message) && <small id="variable-secret-help" className={createForm.formState.errors.secret ? 'form-error' : 'form-help'}>{createForm.formState.errors.secret?.message ?? (options.isPending ? 'Checking whether secret storage is available…' : 'Secret storage is unavailable; create a plain variable instead.')}</small>}
        <Button type="submit" busy={create.isPending}>Save variable</Button>
      </form>
      {create.isError && <ProjectErrorAlert title="Unable to save the variable." error={create.error} fallback="Review the variable and try again." message={staleVariableMessage(create.error, 'Unable to save the variable.')} />}
    </Card>}

    {canManage && editTarget && <Card>
      <h2>Edit {editTarget.key}</h2>
      <p className="form-help">The key and {editTarget.secret ? 'secret' : 'plain-text'} classification cannot be changed. {editTarget.secret ? 'Enter a complete replacement value; the current value cannot be displayed.' : 'Update the stored value below.'}</p>
      {editTarget.secret && !secretsEnabled && <Alert tone="warning" title="Secret editing is unavailable.">Server-side secret storage is disabled. This value remains masked and unchanged.</Alert>}
      <form className="inline-form" onSubmit={editForm.handleSubmit(values => update.mutate({ variable: editTarget, value: values.value }))}>
        <label>Variable key<input aria-label="Editing variable key" autoComplete="off" value={editTarget.key} readOnly /></label>
        <label>Variable value
          <input aria-label={`New value for ${editTarget.key}`} autoComplete="off" maxLength={10000} type={editTarget.secret ? 'password' : 'text'} disabled={editTarget.secret && !secretsEnabled}
            aria-invalid={Boolean(editForm.formState.errors.value)} aria-describedby={editForm.formState.errors.value ? 'edit-variable-value-error' : undefined}
            {...editForm.register('value')} />
          {editForm.formState.errors.value?.message && <small id="edit-variable-value-error" className="form-error">{editForm.formState.errors.value.message}</small>}
        </label>
        <Button type="submit" busy={update.isPending} disabled={editTarget.secret && !secretsEnabled}>Save changes</Button>
        <Button type="button" variant="secondary" disabled={update.isPending} onClick={() => { setEditTarget(undefined); update.reset(); editForm.reset() }}>Cancel</Button>
      </form>
      {update.isError && <ProjectErrorAlert title="Unable to update the variable." error={update.error} fallback="Review the replacement value and try again." message={staleVariableMessage(update.error, 'Unable to update the variable.')} />}
    </Card>}

    <Card>
      <h2>Variables</h2>
      {variablesQuery.isPending && <LoadingState label="Loading variables…" />}
      {variablesQuery.isError && <ProjectErrorAlert title="Unable to load variables." error={variablesQuery.error} fallback="Try again after the backend is ready." onRetry={() => void variablesQuery.refetch()} />}
      {variablesQuery.data?.length
        ? <ul className="resource-list">{variablesQuery.data.map(variable => <li key={variable.key}>
            <span><strong>{variable.key}</strong>{variable.secret && <span className="muted"> · secret</span>}</span>
            <span>{variable.secret ? '••••••••' : variable.value}</span>
            {canManage && <span className="inline-actions">
              <Button type="button" variant="secondary" disabled={variable.secret && !secretsEnabled} onClick={() => startEditing(variable)}>Edit</Button>
              <Button type="button" variant="danger" onClick={() => { remove.reset(); setDeleteTarget(variable) }}>Remove</Button>
            </span>}
          </li>)}</ul>
        : variablesQuery.data ? <EmptyState title="No variables yet" description="Reusable variables will be available to your cases here." /> : null}
    </Card>
    <ConfirmDialog open={Boolean(deleteTarget)} title={`Remove ${deleteTarget?.key ?? 'variable'}?`}
      description="Deletion is blocked while any active or archived test step references this variable. This action cannot be undone."
      confirmLabel="Remove variable" busy={remove.isPending}
      onClose={() => { setDeleteTarget(undefined); remove.reset() }} onConfirm={() => deleteTarget && remove.mutate(deleteTarget)}>
      {remove.isError && remove.error instanceof ApiError && remove.error.code === 'variable_in_use'
        ? <Alert tone="warning" title="Variable is still in use."><p>Remove every <code>{'${'}{deleteTarget?.key}{'}'}</code> reference from project test steps, then retry here.</p><Link className="button button-secondary" to={`${root}/suites`}>Review suites</Link>{remove.error.correlationId && <p className="form-help">Reference: <code>{remove.error.correlationId}</code></p>}</Alert>
        : remove.isError && <ProjectErrorAlert title="Unable to remove the variable." error={remove.error} fallback="The variable was not removed." message={staleVariableMessage(remove.error, 'The variable was not removed.')} />}
    </ConfirmDialog>
  </section>
}

type MemberFormValues = { email: string; role: string }

export function MembersPage() {
  const { projectId = '' } = useParams()
  const { project } = useProjectWorkspace()
  const client = useQueryClient()
  const canManage = project.permissions.includes('MEMBER_MANAGE') && project.status === 'ACTIVE'
  const [removeTarget, setRemoveTarget] = useState<Member>()
  const query = useQuery({ queryKey: projectKeys.members(projectId), queryFn: () => projectsApi.members(projectId) })
  const form = useForm<MemberFormValues>({ defaultValues: { email: '', role: 'TESTER' } })
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: projectKeys.members(projectId), exact: true }),
      client.invalidateQueries({ queryKey: projectKeys.detail(projectId), exact: true }),
    ])
  }
  const recoverFromMembershipError = async (cause: Error) => {
    applyFieldErrors(cause, form.setError, ['email', 'role'])
    if (cause instanceof ApiError && cause.code === 'member_exists') form.setError('email', { message: 'This user is already a project member.' }, { shouldFocus: true })
    if (cause instanceof ApiError && cause.code === 'stale_version') await refresh()
  }
  const add = useMutation({
    mutationFn: (values: MemberFormValues) => projectsApi.addMember(projectId, { ...values, projectVersion: project.version }),
    onSuccess: async () => {
      form.reset()
      await refresh()
    },
    onError: recoverFromMembershipError,
  })
  const update = useMutation({
    mutationFn: ({ member, role }: { member: Member; role: string }) => projectsApi.updateMember(projectId, member.userId, { role, projectVersion: project.version }),
    onSuccess: refresh,
    onError: recoverFromMembershipError,
  })
  const remove = useMutation({
    mutationFn: (member: Member) => projectsApi.removeMember(projectId, member.userId, project.version),
    onSuccess: async () => {
      setRemoveTarget(undefined)
      await refresh()
    },
    onError: recoverFromMembershipError,
  })
  const error = add.error ?? update.error

  return <section className="page-stack">
    {canManage && <Card>
      <h2>Add member</h2>
      <form className="inline-form" onSubmit={form.handleSubmit(values => { update.reset(); remove.reset(); add.mutate(values) })}>
        <label>Email
          <input aria-label="Member email" type="email" placeholder="person@example.com…" autoComplete="email" maxLength={254}
            aria-invalid={Boolean(form.formState.errors.email)} aria-describedby={form.formState.errors.email ? 'member-email-error' : undefined}
            {...form.register('email', { required: 'Enter the member email address.' })} />
          {form.formState.errors.email?.message && <small id="member-email-error" className="form-error">{form.formState.errors.email.message}</small>}
        </label>
        <label>Role<select aria-label="Member role" aria-invalid={Boolean(form.formState.errors.role)} aria-describedby={form.formState.errors.role ? 'member-role-error' : undefined} {...form.register('role')}><option>PROJECT_MANAGER</option><option>TEST_MANAGER</option><option>TESTER</option><option>VIEWER</option></select>{form.formState.errors.role?.message && <small id="member-role-error" className="form-error">{form.formState.errors.role.message}</small>}</label>
        <Button type="submit" busy={add.isPending}>Add member</Button>
      </form>
    </Card>}
    <Card>
      <h2>Members</h2>
      {error && <ProjectErrorAlert title="Membership update failed." error={error} fallback="Unable to update project membership." message={membershipErrorMessage(error)} />}
      {query.isPending && <LoadingState label="Loading members…" />}
      {query.isError && <ProjectErrorAlert title="Unable to load members." error={query.error} fallback="The member list could not be loaded." retryLabel="Try again" onRetry={() => void query.refetch()} />}
      {query.data?.length
        ? <ul className="resource-list">{query.data.map(member => <MemberListItem key={`${member.userId}:${member.version}:${member.role}`} member={member} canManage={canManage}
            busy={update.isPending || remove.isPending}
            onSave={role => { add.reset(); remove.reset(); update.mutate({ member, role }) }}
            onRemove={() => { add.reset(); update.reset(); remove.reset(); setRemoveTarget(member) }} />)}</ul>
        : query.data ? <EmptyState title="No members yet" description="Invite teammates when you are ready to collaborate on this project." /> : null}
    </Card>
    <ConfirmDialog open={Boolean(removeTarget)} title={`Remove ${removeTarget?.displayName ?? 'member'}?`}
      description="This person will immediately lose access to this project. Execution history remains unchanged."
      confirmLabel="Remove member" busy={remove.isPending}
      onClose={() => { setRemoveTarget(undefined); remove.reset() }} onConfirm={() => removeTarget && remove.mutate(removeTarget)}>
      {remove.error && <ProjectErrorAlert title="Unable to remove the member." error={remove.error} fallback="The member was not removed." message={membershipErrorMessage(remove.error)} />}
    </ConfirmDialog>
  </section>
}

function membershipErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return 'Unable to update project membership. Review the member and try again.'
  if (error.code === 'final_project_manager') return 'Assign another project manager before changing or removing the final project manager.'
  if (error.code === 'member_exists') return 'This user is already a member. Review the existing row instead of adding a duplicate.'
  if (error.code === 'stale_version') return 'The project changed. Reloaded data is required before trying again.'
  if (error.code === 'user_not_found') return 'No registered account uses that email address.'
  return error.message
}

function MemberListItem({ member, canManage, busy, onSave, onRemove }: { member: Member; canManage: boolean; busy: boolean; onSave: (role: string) => void; onRemove: () => void }) {
  const [role, setRole] = useState(member.role)
  return <li className="member-row">
    <span className="member-identity">
      <strong>{member.displayName}</strong>
      <span className="muted"> · {member.email}</span>
      <StatusBadge status="neutral">{member.role}</StatusBadge>
      <span className="muted">Effective permissions: {member.permissions.length > 0 ? member.permissions.join(', ') : 'None'}</span>
    </span>
    {canManage && <div className="member-actions">
      <label><span className="sr-only">Role for {member.displayName}</span><select aria-label={`Role for ${member.displayName}`} value={role} disabled={busy} onChange={event => setRole(event.target.value)}><option>PROJECT_MANAGER</option><option>TEST_MANAGER</option><option>TESTER</option><option>VIEWER</option></select></label>
      <Button type="button" variant="secondary" disabled={busy || role === member.role} onClick={() => onSave(role)}>Save role</Button>
      <Button type="button" variant="danger" disabled={busy} onClick={onRemove}>Remove</Button>
    </div>}
  </li>
}
