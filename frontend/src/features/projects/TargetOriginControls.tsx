import { useContext, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseFormRegisterReturn } from 'react-hook-form'

import { AuthContext } from '../auth/AuthContext'
import { ApiError } from '../../lib/api'
import { Button, ConfirmDialog, LoadingState } from '../../components/ui'
import { targetOriginsApi, type ManagedTargetOrigin, type TargetOriginOption } from './api'

type TargetOriginSelectorProps = {
  id: string
  registration: UseFormRegisterReturn
  value: string
  origins: TargetOriginOption[]
  currentOrigin?: string
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  onCreated: (origin: string) => void
}

export function TargetOriginSelector({ id, registration, value, origins, currentOrigin, disabled, invalid, describedBy, onCreated }: TargetOriginSelectorProps) {
  const auth = useContext(AuthContext)
  const client = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [origin, setOrigin] = useState('')
  const [formError, setFormError] = useState('')
  const [createdOrigin, setCreatedOrigin] = useState<TargetOriginOption | null>(null)
  const canManage = auth?.user?.platformPermissions?.includes('USER_ADMINISTER') ?? false
  const availableOrigins = createdOrigin && !origins.some(item => item.origin === createdOrigin.origin)
    ? [...origins, createdOrigin]
    : origins
  const currentMissing = Boolean(currentOrigin && !availableOrigins.some(item => item.origin === currentOrigin))
  const create = useMutation({
    mutationFn: targetOriginsApi.create,
    onSuccess: created => {
      void client.invalidateQueries({ queryKey: ['platform', 'options'] })
      void client.invalidateQueries({ queryKey: ['admin', 'target-origins'] })
      setCreatedOrigin({ origin: created.origin, source: created.source, usable: created.usable, blockedReason: created.blockedReason })
      onCreated(created.origin)
      setOrigin('')
      setFormError('')
      setAddOpen(false)
    },
    onError: cause => {
      const message = cause instanceof ApiError ? cause.message : 'Unable to add this target origin.'
      setFormError(message)
      requestAnimationFrame(() => inputRef.current?.focus())
    },
  })
  function openAdd() {
    setFormError('')
    setAddOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  function addOrigin() {
    if (!origin.trim()) {
      setFormError('Enter the full HTTPS or HTTP origin, for example https://staging.example.com.')
      inputRef.current?.focus()
      return
    }
    create.mutate(origin.trim())
  }
  return <>
    <select id={id} autoComplete="off" disabled={disabled} aria-invalid={invalid} aria-describedby={describedBy} {...registration} value={value}>
      <option value="">Select target origin</option>
      {currentMissing && <option value={currentOrigin} disabled>{currentOrigin} — disabled or no longer available</option>}
      {availableOrigins.map(item => <option key={item.origin} value={item.origin} disabled={!item.usable}>{item.origin}{item.source === 'ADMIN' ? ' — administrator managed' : ''}{item.usable ? '' : ` — ${item.blockedReason ?? 'Unavailable'}`}</option>)}
    </select>
    <div className="inline-actions target-origin-actions">
      {canManage
        ? <Button type="button" variant="ghost" onClick={openAdd} disabled={disabled}>Add target origin</Button>
        : <small className="form-help">Need another origin? Ask a platform administrator to add it.</small>}
    </div>
    <ConfirmDialog open={addOpen} title="Add target origin" description="Only add a target you control. Private addresses, credentials, paths, queries, and fragments are blocked." confirmLabel="Add target origin" confirmVariant="primary" busy={create.isPending} onClose={() => { if (!create.isPending) { setAddOpen(false); setFormError('') } }} onConfirm={addOrigin}>
      <label className="dialog-field" htmlFor="new-target-origin">Origin<input ref={inputRef} id="new-target-origin" name="origin" type="url" placeholder="https://staging.example.com" autoComplete="off" value={origin} aria-invalid={formError ? true : undefined} aria-describedby={formError ? 'new-target-origin-error' : undefined} onChange={event => { setOrigin(event.target.value); setFormError('') }} /></label>
      {formError && <p id="new-target-origin-error" className="form-error" role="alert">{formError}</p>}
    </ConfirmDialog>
  </>
}

export function TargetOriginsAdminCard() {
  const client = useQueryClient()
  const [changing, setChanging] = useState<ManagedTargetOrigin | null>(null)
  const [feedback, setFeedback] = useState('')
  const origins = useQuery({ queryKey: ['admin', 'target-origins'], queryFn: targetOriginsApi.list })
  const change = useMutation({
    mutationFn: (item: ManagedTargetOrigin) => targetOriginsApi.update(item.id!, { enabled: !item.enabled, version: item.version! }),
    onSuccess: updated => {
      client.setQueryData<ManagedTargetOrigin[]>(['admin', 'target-origins'], current => current?.map(item => item.id === updated.id ? updated : item) ?? current)
      void client.invalidateQueries({ queryKey: ['platform', 'options'] })
      setFeedback(`${updated.origin} is now ${updated.enabled ? 'enabled' : 'disabled'}.`)
      setChanging(null)
    },
    onError: cause => setFeedback(cause instanceof ApiError ? cause.message : 'Unable to update this target origin.'),
  })
  return <section className="card" aria-labelledby="target-origins-title">
    <div className="section-heading"><div><h2 id="target-origins-title">Target origins</h2><p className="muted">Environment origins are read-only. Disabled origins stay attached to projects but cannot be checked or executed.</p></div></div>
    {origins.isPending && <LoadingState label="Loading target origins…" />}
    {origins.isError && <div className="inline-actions"><p className="form-error" role="alert">Unable to load target origins.</p><Button type="button" variant="secondary" onClick={() => void origins.refetch()}>Try again</Button></div>}
    {feedback && <p className="form-help" role="status">{feedback}</p>}
    {Array.isArray(origins.data) && <ul className="resource-list">{origins.data.map(item => <li key={item.id ?? `environment-${item.origin}`}>
      <div className="min-w-0"><strong>{item.origin}</strong><span className="muted"> · {item.source === 'ENVIRONMENT' ? 'Environment' : 'Administrator'} · {item.usable ? 'Usable' : item.blockedReason ?? 'Unavailable'} · Used by {item.usageCount} project{item.usageCount === 1 ? '' : 's'}</span></div>
      {item.source === 'ENVIRONMENT' ? <span className="muted">Read-only</span> : <Button type="button" variant={item.enabled ? 'secondary' : 'primary'} disabled={change.isPending} onClick={() => { setFeedback(''); setChanging(item) }}>{item.enabled ? 'Disable' : 'Enable'}</Button>}
    </li>)}</ul>}
    {Array.isArray(origins.data) && origins.data.length === 0 && <p className="muted">No target origins are registered.</p>}
    <ConfirmDialog open={Boolean(changing)} title={changing?.enabled ? 'Disable target origin?' : 'Enable target origin?'} description={changing?.enabled ? `${changing.origin} will be blocked for new checks and executions. Existing project metadata can still be edited.` : `${changing?.origin} will become available for project targets.`} confirmLabel={changing?.enabled ? 'Disable origin' : 'Enable origin'} busy={change.isPending} onClose={() => { if (!change.isPending) setChanging(null) }} onConfirm={() => { if (changing) change.mutate(changing) }} />
  </section>
}
