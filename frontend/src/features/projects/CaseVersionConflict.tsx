import { useEffect, useRef } from 'react'

import { Alert, Button } from '../../components/ui'
import type { TestCase } from './api'
import { caseConflictRows, type CaseConflictDraft } from './caseConflict'

export function CaseVersionConflict({ local, server, busy, onReload, onRetry }: {
  local: CaseConflictDraft
  server: TestCase
  busy?: boolean
  onReload: () => void
  onRetry: () => void
}) {
  const panel = useRef<HTMLElement>(null)
  const rows = caseConflictRows(local, server)
  useEffect(() => { panel.current?.focus() }, [])

  return <section ref={panel} className="version-conflict" tabIndex={-1} aria-labelledby="case-version-conflict-title">
    <Alert tone="warning" title="This case changed in another session.">
      <p id="case-version-conflict-title">Compare your unsaved version with server version {server.version}, then choose which one to keep.</p>
      {rows.length === 0
        ? <p>No visible definition fields differ. The server version still changed, so TestOps will not overwrite it automatically.</p>
        : <div className="conflict-table-wrap"><table className="conflict-table"><thead><tr><th scope="col">Field</th><th scope="col">Your changes</th><th scope="col">Server</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.local}</td><td>{row.server}</td></tr>)}</tbody></table></div>}
      <div className="inline-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onReload}>Reload server version</Button><Button type="button" busy={busy} onClick={onRetry}>Retry my changes</Button></div>
    </Alert>
  </section>
}
