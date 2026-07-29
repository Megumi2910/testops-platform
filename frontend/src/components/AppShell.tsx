import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { Icon, IconButton } from './ui'

function NavigationLink({ to, children, end = false }: { to: string; children: React.ReactNode; end?: boolean }) {
  return <NavLink end={end} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} to={to}>{children}</NavLink>
}

function PrimaryNavigation({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useAuth()
  const unverified = Boolean(user && !user.emailVerified)
  return <nav className="primary-nav" aria-label="Primary navigation">
    <NavigationLink to="/" end>Readiness</NavigationLink>
    {user && !unverified && <NavigationLink to="/projects">Projects</NavigationLink>}
    {user && !unverified && <NavigationLink to="/dashboard">Dashboard</NavigationLink>}
    {user && !unverified && user.platformPermissions?.includes('USER_ADMINISTER') && <NavigationLink to="/admin/users">Admin</NavigationLink>}
    <NavigationLink to={user ? '/account' : '/login'}>{user ? <><span className="nav-account-name">{user.displayName}</span><span aria-hidden="true"> · </span>Account</> : 'Sign in'}</NavigationLink>
    <span className="nav-close"><IconButton label="Close navigation" onClick={onNavigate}><Icon name="close" size={18} /></IconButton></span>
  </nav>
}

export function AppShell() {
  const { user } = useAuth()
  const [navigationOpen, setNavigationOpen] = useState(false)
  const unverified = Boolean(user && !user.emailVerified)
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink className="brand" to="/" aria-label="TestOps home">
            <Icon name="shield" size={22} /> TestOps
          </NavLink>
          <div className={navigationOpen ? 'nav-drawer open' : 'nav-drawer'}><PrimaryNavigation onNavigate={() => setNavigationOpen(false)} /></div>
          <IconButton className="nav-menu" label="Open navigation" onClick={() => setNavigationOpen(true)} aria-expanded={navigationOpen}><Icon name="menu" size={21} /></IconButton>
        </div>
      </header>
      {unverified && user && <div className="verification-banner" role="status" aria-live="polite">Your email is not verified. <NavLink to={`/verify-email?email=${encodeURIComponent(user.email)}&recover=1`}>Verify now</NavLink> to unlock your workspace.</div>}
      <main className="content" id="main-content">
        <Outlet />
      </main>
      <footer className="footer">Managed browser testing foundation</footer>
    </div>
  )
}
