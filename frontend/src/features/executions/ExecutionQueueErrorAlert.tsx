import { Alert, Button } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { getExecutionQueueGuidance } from './executionGuidance'

export function ExecutionQueueErrorAlert({ error, busy = false, onRetry }: { error: unknown; busy?: boolean; onRetry: () => void }) {
  const apiError = error instanceof ApiError ? error : undefined
  const guidance = getExecutionQueueGuidance(apiError?.code)

  return <Alert tone="danger" title={`${guidance.title}.`}>
    <p>{guidance.detail}</p>
    <p><strong>Recommended recovery:</strong> {guidance.recovery}</p>
    {apiError?.message && apiError.message !== guidance.detail && <p className="muted">Server response: {apiError.message}</p>}
    {apiError?.correlationId && <p className="muted">Reference: {apiError.correlationId}</p>}
    {guidance.retryable && <Button type="button" variant="secondary" onClick={onRetry} busy={busy}>Try again</Button>}
  </Alert>
}
