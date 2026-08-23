import { Alert, Button } from '../../components/ui'
import { ApiError } from '../../lib/api'

type ProjectErrorAlertProps = {
  title: string
  error: unknown
  fallback: string
  message?: string
  onRetry?: () => unknown
  retryLabel?: string
  busy?: boolean
}

export function ProjectErrorAlert({ title, error, fallback, message, onRetry, retryLabel = 'Retry', busy = false }: ProjectErrorAlertProps) {
  const apiError = error instanceof ApiError ? error : undefined
  return <Alert tone="danger" title={title}>
    <p>{message ?? apiError?.message ?? fallback}</p>
    {apiError?.correlationId && <p className="form-help">Reference: <code>{apiError.correlationId}</code></p>}
    {onRetry && <Button type="button" variant="secondary" busy={busy} onClick={onRetry}>{retryLabel}</Button>}
  </Alert>
}
