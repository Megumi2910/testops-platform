import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import { Icon } from './ui'

type NavigationLinkProps = { to: string; children: ReactNode; end?: boolean; onNavigate?: () => void }

function NavigationLink({ to, children, end = false, onNavigate }: NavigationLinkProps) {
  return <NavLink end={end} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={onNavigate} to={to}>{children}</NavLink>
}

function menuItems(container: HTMLElement | null) {
  return Array.from(container?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
}

function AccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuWasOpenRef = useRef(false)

  useEffect(() => { setOpen(false) }, [location.pathname, location.hash])

  useEffect(() => {
    if (!open) return undefined
    menuItems(menuRef.current)[0]?.focus()
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.parentElement?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      const items = menuItems(menuRef.current)
      const currentIndex = Math.max(items.indexOf(document.activeElement as HTMLElement), 0)
      const nextIndex = event.key === 'ArrowDown'
        ? (currentIndex + 1) % items.length
        : event.key === 'ArrowUp'
          ? (currentIndex - 1 + items.length) % items.length
          : event.key === 'Home' ? 0 : items.length - 1
      if (items.length > 0) {
        event.preventDefault()
        items[nextIndex].focus()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      menuWasOpenRef.current = true
      return
    }
    if (menuWasOpenRef.current) {
      menuWasOpenRef.current = false
      triggerRef.current?.focus()
    }
  }, [open])

  if (!user) return <NavigationLink to="/login" onNavigate={onNavigate}>Sign in</NavigationLink>

  const closeAndNavigate = () => {
    setOpen(false)
    onNavigate()
  }
  const signOut = async () => {
    setSigningOut(true)
    try {
      await logout()
    } finally {
      closeAndNavigate()
      navigate('/login')
      setSigningOut(false)
    }
  }
  const isAdmin = user.platformPermissions?.includes('USER_ADMINISTER')

  return (
    <div className="account-menu">
      <button
        ref={triggerRef}
        className="account-menu-trigger"
        type="button"
        aria-label={`Open account menu for ${user.displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="account-menu-avatar" aria-hidden="true">{user.displayName.trim().charAt(0).toUpperCase() || '?'}</span>
        <span className="nav-account-name">{user.displayName}</span>
        <span aria-hidden="true">· Account</span>
      </button>
      {open && <div ref={menuRef} id="account-menu" className="account-menu-panel" role="menu" aria-label="Account actions">
        <div className="account-menu-identity" role="presentation">
          <strong>{user.displayName}</strong>
          <span>{user.email}</span>
        </div>
        <NavLink className="account-menu-item" role="menuitem" tabIndex={0} to="/account#security" onClick={closeAndNavigate}>Account security</NavLink>
        <NavLink className="account-menu-item" role="menuitem" tabIndex={0} to="/account#sessions" onClick={closeAndNavigate}>Active sessions</NavLink>
        {!user.emailVerified && <NavLink className="account-menu-item" role="menuitem" tabIndex={0} to={`/verify-email?email=${encodeURIComponent(user.email)}&recover=1`} onClick={closeAndNavigate}>Verify email</NavLink>}
        {isAdmin && <NavLink className="account-menu-item" role="menuitem" tabIndex={0} to="/admin/users" onClick={closeAndNavigate}>Administration</NavLink>}
        <button className="account-menu-item account-menu-signout" role="menuitem" type="button" onClick={() => void signOut()} disabled={signingOut} aria-busy={signingOut}>
          <Icon name="logout" size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>}
    </div>
  )
}

function PrimaryNavigation({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useAuth()
  const unverified = Boolean(user && !user.emailVerified)
  return <nav className="primary-nav" aria-label="Primary navigation">
    <NavigationLink to="/" end onNavigate={onNavigate}>Readiness</NavigationLink>
    {user && !unverified && <NavigationLink to="/projects" onNavigate={onNavigate}>Projects</NavigationLink>}
    {user && !unverified && <NavigationLink to="/dashboard" onNavigate={onNavigate}>Dashboard</NavigationLink>}
    {user && !unverified && user.platformPermissions?.includes('USER_ADMINISTER') && <NavigationLink to="/admin/users" onNavigate={onNavigate}>Admin</NavigationLink>}
    <AccountMenu onNavigate={onNavigate} />
    <span className="nav-close"><button className="icon-button" type="button" aria-label="Close navigation" onClick={onNavigate}><Icon name="close" size={18} /></button></span>
  </nav>
}

export function AppShell() {
  const { user } = useAuth()
  const location = useLocation()
  const [navigationOpen, setNavigationOpen] = useState(false)
  const navigationRef = useRef<HTMLDivElement>(null)
  const navigationTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { setNavigationOpen(false) }, [location.pathname, location.hash])

  useEffect(() => {
    if (!navigationOpen) return undefined
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const navigationTrigger = navigationTriggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => Array.from(navigationRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
    focusable()[0]?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setNavigationOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
      navigationTrigger?.focus()
    }
  }, [navigationOpen])

  const unverified = Boolean(user && !user.emailVerified)
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink className="brand" to="/" aria-label="TestOps home">
            <Icon name="shield" size={22} /> TestOps
          </NavLink>
          {navigationOpen && <button className="nav-drawer-backdrop" type="button" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />}
          <div ref={navigationRef} className={navigationOpen ? 'nav-drawer open' : 'nav-drawer'} role={navigationOpen ? 'dialog' : undefined} aria-modal={navigationOpen ? true : undefined} aria-label={navigationOpen ? 'Site navigation' : undefined}>
            <PrimaryNavigation onNavigate={() => setNavigationOpen(false)} />
          </div>
          <button ref={navigationTriggerRef} className="icon-button nav-menu" type="button" aria-label="Open navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><Icon name="menu" size={21} /></button>
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
