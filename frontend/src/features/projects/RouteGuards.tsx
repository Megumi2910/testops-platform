import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { LoadingState } from '../../components/ui'

export function ProtectedRoute() {
  const { user, providers, loading } = useAuth()
  if (loading) return <section className="card"><LoadingState label="Loading your workspace…" /></section>
  if (!providers?.enabled) return <Navigate to="/" replace />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export function VerifiedRoute() {
  const { user, providers, loading } = useAuth()
  if (loading) return <section className="card"><LoadingState label="Loading your workspace…" /></section>
  if (!providers?.enabled) return <Navigate to="/" replace />
  if (!user) return <Navigate to="/login" replace />
  if (!user.emailVerified) return <Navigate to={`/verify-email?email=${encodeURIComponent(user.email)}&recover=1`} replace />
  return <Outlet />
}
