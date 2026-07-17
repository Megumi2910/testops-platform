import { SystemHealthPanel } from '../features/system-health/SystemHealthPanel'

export function HomePage() {
  return (
    <section className="page-stack">
      <div>
        <p className="eyebrow">Milestone 1</p>
        <h1>TestOps Platform</h1>
        <p className="lede">The management shell is ready for the browser-testing platform.</p>
      </div>
      <SystemHealthPanel />
    </section>
  )
}

export function NotFoundPage() {
  return (
    <section className="card page-stack">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>The requested TestOps page does not exist yet.</p>
    </section>
  )
}
