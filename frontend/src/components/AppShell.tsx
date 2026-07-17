import { NavLink, Outlet } from 'react-router-dom'

export function AppShell() {
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
