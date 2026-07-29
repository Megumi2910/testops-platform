import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { Alert, Button, Card, ConfirmDialog, EmptyState, LoadingState, StatusBadge } from '../../components/ui'
import { projectKeys, projectsApi } from './api'
import { useProjectWorkspace } from './ProjectWorkspaceContext'

export function VariablesPage() {
  const { projectId = '' } = useParams()
  const { project } = useProjectWorkspace()
  const client = useQueryClient()
  const [deleteKey, setDeleteKey] = useState<string>()
  const canManage = project.permissions.includes('VARIABLE_MANAGE') && project.status === 'ACTIVE'
  const query = useQuery({ queryKey: projectKeys.variables(projectId), queryFn: () => projectsApi.variables(projectId) })
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
  const query = useQuery({ queryKey: projectKeys.members(projectId), queryFn: () => projectsApi.members(projectId) })
  const form = useForm({ defaultValues: { email: '', role: 'TESTER' } })
  const mutation = useMutation({
    mutationFn: projectsApi.addMember.bind(null, projectId),
    onSuccess: () => {
      form.reset()
      void client.invalidateQueries({ queryKey: projectKeys.members(projectId) })
    },
  })

  return <section className="page-stack">
    {canManage && <Card>
      <h2>Add member</h2>
      <form className="inline-form" onSubmit={form.handleSubmit(values => mutation.mutate(values))}>
        <label>Email<input aria-label="Member email" type="email" placeholder="person@example.com…" autoComplete="email" {...form.register('email')} /></label>
        <label>Role<select aria-label="Member role" {...form.register('role')}><option>PROJECT_MANAGER</option><option>TEST_MANAGER</option><option>TESTER</option><option>VIEWER</option></select></label>
        <Button type="submit" busy={mutation.isPending}>Add member</Button>
      </form>
      {mutation.isError && <p className="form-error" role="alert">Unable to add this member.</p>}
    </Card>}
    <Card>
      <h2>Members</h2>
      {query.isPending && <LoadingState label="Loading members…" />}
      {query.isError && <Alert tone="danger" title="Unable to load members.">Try again after the backend is ready.</Alert>}
      {query.data?.length
        ? <ul className="resource-list">{query.data.map(member => <li key={member.userId}>
            <span><strong>{member.displayName}</strong><span className="muted"> · {member.email}</span></span>
            <StatusBadge status="neutral">{member.role}</StatusBadge>
          </li>)}</ul>
        : query.data ? <EmptyState title="No members yet" description="Invite teammates when you are ready to collaborate on this project." /> : null}
    </Card>
  </section>
}
