import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

export function AppShell() {
  const { user } = useAuth()
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink className="brand" to="/" aria-label="TestOps home">
            TestOps
          </NavLink>
          <nav aria-label="Primary navigation">
            <NavLink className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} to="/">
              Readiness
            </NavLink>
            <NavLink className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} to={user ? '/' : '/login'}>
              {user ? user.displayName : 'Sign in'}
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="content" id="main-content">
        <Outlet />
      </main>
      <footer className="footer">Managed browser testing foundation</footer>
    </div>
  )
}
