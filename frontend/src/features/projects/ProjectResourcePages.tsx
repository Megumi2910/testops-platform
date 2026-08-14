import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { Alert, Button, Card, ConfirmDialog, EmptyState, LoadingState, StatusBadge } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { projectKeys, projectsApi, type Member } from './api'
import { useProjectWorkspace } from './ProjectWorkspaceContext'

export function VariablesPage() {
  const { projectId = '' } = useParams()
  const { project } = useProjectWorkspace()
  const client = useQueryClient()
  const [deleteKey, setDeleteKey] = useState<string>()
  const canView = project.permissions.includes('VARIABLE_VIEW')
  const canManage = canView && project.permissions.includes('VARIABLE_MANAGE') && project.status === 'ACTIVE'
  const query = useQuery({ queryKey: projectKeys.variables(projectId), queryFn: () => projectsApi.variables(projectId), enabled: canView })
  const form = useForm({ defaultValues: { key: '', secret: false, value: '' } })
  const create = useMutation({
    mutationFn: projectsApi.createVariable.bind(null, projectId),
    onSuccess: () => {
      form.reset()
      void client.invalidateQueries({ queryKey: projectKeys.variables(projectId) })
    },
  })
  const remove = useMutation({
    mutationFn: (key: string) => projectsApi.deleteVariable(projectId, key),
    onSuccess: () => {
      setDeleteKey(undefined)
      void client.invalidateQueries({ queryKey: projectKeys.variables(projectId) })
    },
  })

  if (!canView) return <section className="page-stack">
    <Alert tone="danger" title="Variables are restricted.">
      <p>Your project role does not include variable visibility.</p>
      <Link className="button button-secondary" to={`/projects/${projectId}`}>Back to project overview</Link>
    </Alert>
  </section>

  return <section className="page-stack">
    {canManage && <Card>
      <h2>Add variable</h2>
      <p className="form-help">Secret values are write-only and require the server feature flag and key.</p>
      <form className="inline-form" onSubmit={form.handleSubmit(values => create.mutate(values))}>
        <label>Variable key<input aria-label="Variable key" placeholder="BASE_URL…" {...form.register('key')} /></label>
        <label>Variable value<input aria-label="Variable value" placeholder="Value…" type={form.watch('secret') ? 'password' : 'text'} {...form.register('value')} /></label>
        <label className="checkbox"><input type="checkbox" {...form.register('secret')} /> Secret</label>
        <Button type="submit" busy={create.isPending}>Save variable</Button>
      </form>
      {create.isError && <p className="form-error" role="alert">Unable to save the variable.</p>}
    </Card>}
    <Card>
      <h2>Variables</h2>
      {query.isPending && <LoadingState label="Loading variables…" />}
      {query.isError && <Alert tone="danger" title="Unable to load variables.">Try again after the backend is ready.</Alert>}
      {query.data?.length
        ? <ul className="resource-list">{query.data.map(variable => <li key={variable.key}>
            <span><strong>{variable.key}</strong>{variable.secret && <span className="muted"> · secret</span>}</span>
            <span>{variable.secret ? '••••••••' : variable.value}</span>
            {canManage && <button className="link-button danger-text" type="button" onClick={() => setDeleteKey(variable.key)}>Remove</button>}
          </li>)}</ul>
        : query.data ? <EmptyState title="No variables yet" description="Reusable variables will be available to your cases here." /> : null}
    </Card>
    <ConfirmDialog open={Boolean(deleteKey)} title={`Remove ${deleteKey ?? 'variable'}?`} description="Cases that reference this variable may fail on their next run." confirmLabel="Remove variable" busy={remove.isPending} onClose={() => setDeleteKey(undefined)} onConfirm={() => deleteKey && remove.mutate(deleteKey)} />
  </section>
}

export function MembersPage() {
  const { projectId = '' } = useParams()
  const { project } = useProjectWorkspace()
  const client = useQueryClient()
  const canManage = project.permissions.includes('MEMBER_MANAGE') && project.status === 'ACTIVE'
  const [removeTarget, setRemoveTarget] = useState<Member>()
  const query = useQuery({ queryKey: projectKeys.members(projectId), queryFn: () => projectsApi.members(projectId) })
  const form = useForm({ defaultValues: { email: '', role: 'TESTER' } })
  const refresh = () => {
    void client.invalidateQueries({ queryKey: projectKeys.members(projectId) })
    void client.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
  }
  const add = useMutation({
    mutationFn: (values: { email: string; role: string }) => projectsApi.addMember(projectId, { ...values, projectVersion: project.version }),
    onSuccess: () => {
      form.reset()
      refresh()
    },
  })
  const update = useMutation({
    mutationFn: ({ member, role }: { member: Member; role: string }) => projectsApi.updateMember(projectId, member.userId, { role, projectVersion: project.version }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (member: Member) => projectsApi.removeMember(projectId, member.userId, project.version),
    onSuccess: () => {
      setRemoveTarget(undefined)
      refresh()
    },
  })
  const error = add.error ?? update.error ?? remove.error
  const errorMessage = error instanceof ApiError && error.code === 'final_project_manager'
    ? 'Assign another project manager before changing or removing the final project manager.'
    : error instanceof ApiError && error.code === 'stale_version'
      ? 'The project changed. Reloaded data is required before trying again.'
      : 'Unable to update project membership. Review the member and try again.'

  return <section className="page-stack">
    {canManage && <Card>
      <h2>Add member</h2>
      <form className="inline-form" onSubmit={form.handleSubmit(values => add.mutate(values))}>
        <label>Email<input aria-label="Member email" type="email" placeholder="person@example.com…" autoComplete="email" {...form.register('email')} /></label>
        <label>Role<select aria-label="Member role" {...form.register('role')}><option>PROJECT_MANAGER</option><option>TEST_MANAGER</option><option>TESTER</option><option>VIEWER</option></select></label>
        <Button type="submit" busy={add.isPending}>Add member</Button>
      </form>
    </Card>}
    <Card>
      <h2>Members</h2>
      {error && <Alert tone="danger" title="Membership update failed.">{errorMessage}</Alert>}
      {query.isPending && <LoadingState label="Loading members…" />}
      {query.isError && <Alert tone="danger" title="Unable to load members.">Try again after the backend is ready.</Alert>}
      {query.data?.length
        ? <ul className="resource-list">{query.data.map(member => <MemberListItem key={member.userId} member={member} canManage={canManage}
            busy={update.isPending || remove.isPending}
            onSave={role => update.mutate({ member, role })}
            onRemove={() => setRemoveTarget(member)} />)}</ul>
        : query.data ? <EmptyState title="No members yet" description="Invite teammates when you are ready to collaborate on this project." /> : null}
    </Card>
    <ConfirmDialog open={Boolean(removeTarget)} title={`Remove ${removeTarget?.displayName ?? 'member'}?`}
      description="This person will immediately lose access to this project. Execution history remains unchanged."
      confirmLabel="Remove member" busy={remove.isPending}
      onClose={() => setRemoveTarget(undefined)} onConfirm={() => removeTarget && remove.mutate(removeTarget)} />
  </section>
}

function MemberListItem({ member, canManage, busy, onSave, onRemove }: { member: Member; canManage: boolean; busy: boolean; onSave: (role: string) => void; onRemove: () => void }) {
  const [role, setRole] = useState(member.role)
  return <li className="member-row">
    <span className="member-identity"><strong>{member.displayName}</strong><span className="muted"> · {member.email}</span></span>
    {canManage
      ? <div className="member-actions">
          <label><span className="sr-only">Role for {member.displayName}</span><select aria-label={`Role for ${member.displayName}`} value={role} disabled={busy} onChange={event => setRole(event.target.value)}><option>PROJECT_MANAGER</option><option>TEST_MANAGER</option><option>TESTER</option><option>VIEWER</option></select></label>
          <Button type="button" variant="secondary" disabled={busy || role === member.role} onClick={() => onSave(role)}>Save role</Button>
          <Button type="button" variant="danger" disabled={busy} onClick={onRemove}>Remove</Button>
        </div>
      : <StatusBadge status="neutral">{member.role}</StatusBadge>}
  </li>
}
