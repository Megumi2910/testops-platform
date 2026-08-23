import { useEffect, useState } from 'react'

import { Alert, ConfirmDialog } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { ProjectErrorAlert } from './ProjectErrorAlert'

type RestoreDialogProps = {
  open: boolean
  kind: 'suite' | 'case'
  currentName: string
  busy: boolean
  error: Error | null
  onClose: () => void
  onRestore: (name?: string) => void
}

export function RestoreDefinitionDialog({ open, kind, currentName, busy, error, onClose, onRestore }: RestoreDialogProps) {
  const [name, setName] = useState(currentName)
  const conflict = error instanceof ApiError && error.status === 409 && error.code?.includes('restore_name_conflict')

  useEffect(() => { if (open) setName(currentName) }, [currentName, open])

  return <ConfirmDialog
    open={open}
    title={`Restore ${kind}?`}
    description={`The ${kind} becomes active again${kind === 'case' ? ' as DRAFT' : ''}. Existing execution history is preserved.`}
    confirmLabel={`Restore ${kind}`}
    confirmVariant="primary"
    busy={busy}
    onClose={onClose}
    onConfirm={() => onRestore(name.trim() === currentName ? undefined : name.trim())}
  >
    {conflict && <Alert tone="warning" title="That name is already active.">Choose a different name to restore this {kind} safely.{error instanceof ApiError && error.correlationId && <span className="form-help"> Reference: <code>{error.correlationId}</code></span>}</Alert>}
    <label className="dialog-field" htmlFor="restore-definition-name">Restore name<input id="restore-definition-name" name="restoreName" autoComplete="off" value={name} maxLength={kind === 'suite' ? 160 : 200} onChange={event => setName(event.target.value)} disabled={busy} /></label>
    {error && !conflict && <ProjectErrorAlert title={`Unable to restore this ${kind}.`} error={error} fallback={`The ${kind} remains archived.`} retryLabel={`Retry restore ${kind}`} busy={busy} onRetry={() => onRestore(name.trim() === currentName ? undefined : name.trim())} />}
  </ConfirmDialog>
}
