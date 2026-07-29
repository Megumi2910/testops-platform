import { SystemHealthPanel } from '../features/system-health/SystemHealthPanel'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { Button, Card, EmptyState, Icon, PageHeader } from '../components/ui'

export function HomePage() {
  const { user, loading, logout } = useAuth()
  return (
    <section className="page-stack">
      <PageHeader eyebrow="TestOps workspace" title="Browser checks you can trust." description="Create a project, define accessible test steps, and inspect every execution from one focused workspace." actions={user && !user.emailVerified ? undefined : <Link className="button button-secondary" to={user ? '/projects' : '/login'}>{user ? 'Open projects' : 'Get started'} <Icon name="arrow" size={16} /></Link>} />
      <SystemHealthPanel />
      {!loading && (user ? <Card className="welcome-card"><div><p className="eyebrow">Signed in</p><h2>{user.displayName}</h2><p className="muted">{user.email}</p></div><div className="inline-actions"><Link className="button" to="/projects"><Icon name="folder" size={17} /> Open projects</Link><Link className="button button-secondary" to="/dashboard"><Icon name="dashboard" size={17} /> Open dashboard</Link><Button variant="ghost" onClick={() => void logout()}><Icon name="logout" size={17} /> Sign out</Button></div></Card> : <Card><EmptyState title="Start your first workspace" description="Sign in to create projects, define checks, and run them against a safe target." action={<><Link className="button" to="/login">Sign in</Link><Link className="button button-secondary" to="/register">Create account</Link></>} /></Card>)}
    </section>
  )
}

export function NotFoundPage() {
  return (
    <section className="card page-stack">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>The requested TestOps page does not exist.</p>
      <Link className="button button-secondary" to="/">Return to readiness</Link>
    </section>
  )
}
