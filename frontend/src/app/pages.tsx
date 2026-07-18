import { SystemHealthPanel } from '../features/system-health/SystemHealthPanel'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

export function HomePage() {
  const { user, loading, logout } = useAuth()
  return (
    <section className="page-stack">
      <div>
        <p className="eyebrow">Milestone 2</p>
        <h1>TestOps Platform</h1>
        <p className="lede">Identity and email verification are ready for the browser-testing platform.</p>
      </div>
      <SystemHealthPanel />
      {!loading && (user ? <section className="card account-card"><p className="eyebrow">Signed in</p><h2>{user.displayName}</h2><p>{user.email}</p><button type="button" className="secondary" onClick={() => void logout()}>Sign out</button></section> : <section className="card account-card"><p>Authentication is available when enabled by the deployment.</p><div className="inline-actions"><Link className="button" to="/login">Sign in</Link><Link className="button secondary" to="/register">Create account</Link></div></section>)}
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
