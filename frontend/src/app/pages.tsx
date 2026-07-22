import { SystemHealthPanel } from '../features/system-health/SystemHealthPanel'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

export function HomePage() {
  const { user, loading, logout } = useAuth()
  return (
    <section className="page-stack">
      <div>
        <p className="eyebrow">Milestone 4</p>
        <h1>Browser checks that you can run.</h1>
        <p className="lede">Create a project, define accessible test steps, and inspect every execution from one workspace.</p>
      </div>
      <SystemHealthPanel />
      {!loading && (user ? <section className="card account-card"><p className="eyebrow">Signed in</p><h2>{user.displayName}</h2><p>{user.email}</p><div className="inline-actions"><Link className="button" to="/projects">Open projects</Link><button type="button" className="secondary" onClick={() => void logout()}>Sign out</button></div></section> : <section className="card account-card"><p>Sign in to create projects and run browser checks.</p><div className="inline-actions"><Link className="button" to="/login">Sign in</Link><Link className="button secondary" to="/register">Create account</Link></div></section>)}
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
