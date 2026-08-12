import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { locationReturnTo } from '../auth/returnTo'
import { LoadingState } from '../../components/ui'

export function ProtectedRoute() {
  const { user, providers, loading } = useAuth()
  const location = useLocation()
  if (loading) return <section className="card"><LoadingState label="Loading your workspace…" /></section>
  if (!providers?.enabled) return <Navigate to="/" replace />
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(locationReturnTo(location))}`} replace />
  return <Outlet />
}

export function VerifiedRoute() {
  const { user, providers, loading } = useAuth()
  const location = useLocation()
  if (loading) return <section className="card"><LoadingState label="Loading your workspace…" /></section>
  if (!providers?.enabled) return <Navigate to="/" replace />
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(locationReturnTo(location))}`} replace />
  if (!user.emailVerified) return <Navigate to={`/verify-email?email=${encodeURIComponent(user.email)}&recover=1&returnTo=${encodeURIComponent(locationReturnTo(location))}`} replace />
  return <Outlet />
}

export function PlatformPermissionRoute({ permission }: { permission: string }) {
  const { user, providers, loading } = useAuth()
  const location = useLocation()
  if (loading) return <section className="card"><LoadingState label="Checking your permissions…" /></section>
  if (!providers?.enabled) return <Navigate to="/" replace />
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(locationReturnTo(location))}`} replace />
  if (!user.emailVerified) return <Navigate to={`/verify-email?email=${encodeURIComponent(user.email)}&recover=1&returnTo=${encodeURIComponent(locationReturnTo(location))}`} replace />
  if (!user.platformPermissions?.includes(permission)) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
