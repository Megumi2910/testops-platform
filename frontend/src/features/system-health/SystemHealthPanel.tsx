import { useSystemHealth } from './api'

export function SystemHealthPanel() {
  const health = useSystemHealth()

  if (health.isPending) {
    return <section className="card status-card" aria-live="polite">Checking service health…</section>
  }

  if (health.isError) {
    return (
      <section className="card status-card status-error" aria-live="assertive">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <h2>Backend unavailable</h2>
          <p>Start the Compose services and refresh this page.</p>
        </div>
      </section>
    )
  }

  const isHealthy = health.data.status.toUpperCase() === 'UP'
  return (
    <section className={isHealthy ? 'card status-card status-ok' : 'card status-card status-warn'} aria-live="polite">
      <span className="status-dot" aria-hidden="true" />
      <div>
        <h2>Backend {isHealthy ? 'ready' : 'degraded'}</h2>
        <p>Actuator status: <strong>{health.data.status}</strong></p>
      </div>
    </section>
  )
}
