import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { authApi } from './api'
import { apiFetch, ApiError } from '../../lib/api'
import { useAuth } from './AuthContext'
import { Alert, Button, ConfirmDialog, LoadingState, PageHeader } from '../../components/ui'

type AdminUser = { id: string; email: string; displayName: string; status: string; platformRole: string; emailVerified: boolean; createdAt: string; lastLoginAt?: string }
type AdminUsersResponse = { content: AdminUser[]; page?: number; totalPages?: number; totalElements?: number }

function adminMutationError(cause: unknown) {
  if (!(cause instanceof ApiError)) return 'Unable to update this user.'
  switch (cause.code) {
    case 'final_active_admin': return 'The final active administrator cannot be demoted or disabled. Keep another active administrator active before trying again.'
    case 'user_not_found': return 'This account no longer exists. Refresh the list and try again.'
    case 'invalid_platform_role': return 'Choose a supported platform role and try again.'
    case 'invalid_account_status': return 'Choose a supported account status and try again.'
    default: return cause.message || 'Unable to update this user.'
  }
}

function formatSessionDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function AccountPage() {
  const { user, logout, reloadUser } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [passwordPending, setPasswordPending] = useState(false)
  const [setupOtp, setSetupOtp] = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupSent, setSetupSent] = useState(false)
  const [setupPending, setSetupPending] = useState(false)
  const [linkPending, setLinkPending] = useState(false)
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [unlinkPassword, setUnlinkPassword] = useState('')
  const [unlinkPending, setUnlinkPending] = useState(false)
  const [sessionPending, setSessionPending] = useState<string | null>(null)
  const [revokeAllPending, setRevokeAllPending] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const sessions = useQuery({ queryKey: ['account', 'sessions'], queryFn: authApi.sessions })

  useEffect(() => {
    const anchor = location.hash.slice(1)
    if (!anchor) return
    const timer = window.setTimeout(() => {
      const element = document.getElementById(anchor)
      if (element && typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'start' })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [location.hash])

  if (!user) return null
  const clearFeedback = () => { setError(''); setMessage('') }
  const reportError = (cause: unknown, fallback: string) => setError(cause instanceof ApiError ? cause.message : fallback)

  async function submitPasswordChange(event: FormEvent) {
    event.preventDefault()
    clearFeedback()
    if (newPassword !== passwordConfirmation) { setError('New password and confirmation must match.'); return }
    setPasswordPending(true)
    try {
      await authApi.changePassword({ currentPassword, newPassword })
      await logout()
      navigate('/login?reason=password-changed', { replace: true })
    } catch (cause) { reportError(cause, 'Unable to change your password. Try again.') }
    finally { setPasswordPending(false) }
  }

  async function sendPasswordSetupCode() {
    clearFeedback(); setSetupPending(true)
    try { const response = await authApi.passwordChallenge(); setSetupSent(true); setMessage(response.message) }
    catch (cause) { reportError(cause, 'Unable to send a password setup code. Try again.') }
    finally { setSetupPending(false) }
  }

  async function confirmPasswordSetup(event: FormEvent) {
    event.preventDefault(); clearFeedback(); setSetupPending(true)
    try {
      await authApi.passwordConfirm({ otp: setupOtp, password: setupPassword })
      await reloadUser()
      setSetupSent(false); setSetupOtp(''); setSetupPassword(''); setMessage('Password login added to your account.')
    } catch (cause) { reportError(cause, 'Unable to add a password login. Check the code and try again.') }
    finally { setSetupPending(false) }
  }

  async function linkGoogle() {
    clearFeedback(); setLinkPending(true)
    try { await authApi.linkGoogle() } catch (cause) { reportError(cause, 'Google linking is unavailable. Try again later.'); setLinkPending(false) }
  }

  async function confirmGoogleUnlink() {
    clearFeedback(); setUnlinkPending(true)
    try {
      await authApi.unlinkGoogle(unlinkPassword)
      await logout()
      navigate('/login?reason=google-unlinked', { replace: true })
    } catch (cause) { reportError(cause, 'Unable to unlink Google. Check your password and try again.') }
    finally { setUnlinkPending(false) }
  }

  async function revokeSession(familyId: string) {
    setSessionError(''); setSessionPending(familyId)
    try { await authApi.revokeSession(familyId); await sessions.refetch(); setMessage('Session revoked.') }
    catch (cause) { setSessionError(cause instanceof ApiError ? cause.message : 'Unable to revoke this session. Try again.') }
    finally { setSessionPending(null) }
  }

  async function revokeAllSessions() {
    setSessionError(''); setRevokeAllPending(true)
    try { await authApi.revokeAll(); await logout(); navigate('/login?reason=sessions-revoked', { replace: true }) }
    catch (cause) { setSessionError(cause instanceof ApiError ? cause.message : 'Unable to revoke all sessions. Try again.'); setRevokeAllPending(false) }
  }

  return <section className="page-stack">
    <PageHeader eyebrow="Account" title="Account security" description="Manage how you sign in, protect your account, and review active sessions." />
    {message && <Alert tone="success">{message}</Alert>}
    {error && <Alert tone="danger">{error}</Alert>}
    <section className="card account-card account-anchor" id="security" aria-labelledby="account-overview-title">
      <h2 id="account-overview-title">{user.displayName}</h2>
      <p>{user.email}</p>
      <dl className="account-details"><div><dt>Platform role</dt><dd>{user.platformRole}</dd></div><div><dt>Status</dt><dd>{user.status}</dd></div><div><dt>Email</dt><dd>{user.emailVerified ? 'Verified' : 'Verification required'}</dd></div></dl>
    </section>
    <section className="card account-card account-anchor" id="login-methods" aria-labelledby="login-methods-title">
      <div className="section-heading"><div><h2 id="login-methods-title">Login methods</h2><p className="muted">Use a password, Google, or both. Removing Google signs you out everywhere.</p></div></div>
      <p><strong>Connected:</strong> {user.loginMethods.join(', ') || 'None'}</p>
      <div className="inline-actions">
        {!user.loginMethods.includes('GOOGLE') && <Button type="button" busy={linkPending} onClick={() => void linkGoogle()}>Link Google</Button>}
        {user.loginMethods.includes('GOOGLE') && user.loginMethods.includes('PASSWORD') && <Button type="button" variant="secondary" onClick={() => setUnlinkOpen(true)}>Unlink Google</Button>}
      </div>
    </section>
    {user.loginMethods.includes('PASSWORD') ? <section className="card account-card" aria-labelledby="change-password-title">
      <h2 id="change-password-title">Change password</h2>
      <p className="muted">Changing your password signs out every refresh session, including this browser.</p>
      <form className="form-stack" onSubmit={submitPasswordChange}>
        <label htmlFor="current-password">Current password<input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
        <label htmlFor="new-password">New password<input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
        <label htmlFor="password-confirmation">Confirm new password<input id="password-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} /></label>
        <Button type="submit" busy={passwordPending}>Change password</Button>
      </form>
    </section> : <section className="card account-card" aria-labelledby="password-setup-title">
      <h2 id="password-setup-title">Add a password login</h2>
      <p className="muted">Google-only accounts can add a password after confirming a code sent to the verified email.</p>
      {!setupSent ? <Button type="button" busy={setupPending} onClick={() => void sendPasswordSetupCode()}>Send setup code</Button> : <form className="form-stack" onSubmit={confirmPasswordSetup}>
        <label htmlFor="setup-otp">Verification code<input id="setup-otp" name="setupOtp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={setupOtp} onChange={event => setSetupOtp(event.target.value.replace(/\D/g, ''))} /></label>
        <label htmlFor="setup-password">New password<input id="setup-password" name="setupPassword" type="password" autoComplete="new-password" minLength={12} required value={setupPassword} onChange={event => setSetupPassword(event.target.value)} /></label>
        <Button type="submit" busy={setupPending}>Confirm password</Button>
        <Button type="button" variant="secondary" busy={setupPending} onClick={() => void sendPasswordSetupCode()}>Send another code</Button>
      </form>}
    </section>}
    <section className="card account-card account-anchor" id="sessions" aria-labelledby="sessions-title">
      <div className="section-heading"><div><h2 id="sessions-title">Active sessions</h2><p className="muted">Revoke one browser or sign out everywhere.</p></div><Button type="button" variant="secondary" busy={revokeAllPending} onClick={() => void revokeAllSessions()}>Revoke all sessions</Button></div>
      {sessionError && <Alert tone="danger">{sessionError}</Alert>}
      {sessions.isPending && <LoadingState label="Loading sessions…" />}
      {sessions.isError && <div className="inline-actions"><p className="form-error" role="alert">Unable to load sessions.</p><Button type="button" variant="secondary" onClick={() => void sessions.refetch()}>Try again</Button></div>}
      {sessions.data?.length === 0 && <p className="muted">No active sessions.</p>}
      {sessions.data && sessions.data.length > 0 && <ul className="resource-list">{sessions.data.map(session => <li key={session.familyId}><span className="min-w-0"><strong>{session.userAgent || 'Unknown browser'}</strong><span className="muted"> · Signed in {formatSessionDate(session.issuedAt)} · Expires {formatSessionDate(session.expiresAt)}</span></span><Button type="button" variant="ghost" busy={sessionPending === session.familyId} onClick={() => void revokeSession(session.familyId)}>Revoke</Button></li>)}</ul>}
    </section>
    <ConfirmDialog open={unlinkOpen} title="Unlink Google?" description="You will be signed out on every device. Enter your current password to confirm." confirmLabel="Unlink Google" busy={unlinkPending} onClose={() => { if (!unlinkPending) { setUnlinkOpen(false); setUnlinkPassword('') } }} onConfirm={() => void confirmGoogleUnlink()}>
      <label className="dialog-field" htmlFor="unlink-password">Current password<input id="unlink-password" name="unlinkPassword" type="password" autoComplete="current-password" required value={unlinkPassword} onChange={event => setUnlinkPassword(event.target.value)} /></label>
    </ConfirmDialog>
  </section>
}

export function AdminUsersPage() {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const deferredQuery = useDeferredValue(query)
  const users = useQuery({
    queryKey: ['admin-users', deferredQuery, page],
    queryFn: () => apiFetch<AdminUsersResponse>(`/api/v1/admin/users?page=${page}&size=25${deferredQuery ? `&query=${encodeURIComponent(deferredQuery)}` : ''}`),
    placeholderData: keepPreviousData,
  })
  async function updateUser(id: string, path: string, body: Record<string, string>) {
    setPendingUserId(id)
    setMessage('')
    setError('')
    try {
      await apiFetch(`/api/v1/admin/users/${id}/${path}`, { method: 'PATCH', body: JSON.stringify(body) })
      setMessage('User updated.')
      await users.refetch()
    } catch (cause) {
      setError(adminMutationError(cause))
    } finally {
      setPendingUserId(null)
    }
  }
  const totalPages = Math.max(1, users.data?.totalPages ?? 1)
  return <section className="page-stack"><div><p className="eyebrow">Administration</p><h1>Users</h1><p className="lede">Manage platform roles and account status. Project roles remain scoped to each project.</p></div><label className="search-field" htmlFor="admin-user-search">Search users<input id="admin-user-search" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder="Email or display name" autoComplete="off" /></label>{message && <p className="form-help" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="card"><ul className="resource-list">{users.data?.content.map(user => <li key={user.id}><span><strong>{user.displayName}</strong><span className="muted"> · {user.email}</span></span><span className="inline-actions"><select aria-label={`Platform role for ${user.email}`} value={user.platformRole} disabled={pendingUserId === user.id} onChange={event => void updateUser(user.id, 'platform-role', { platformRole: event.target.value })}><option>MEMBER</option><option>ADMIN</option></select><select aria-label={`Account status for ${user.email}`} value={user.status} disabled={pendingUserId === user.id} onChange={event => void updateUser(user.id, 'status', { status: event.target.value })}><option>ACTIVE</option><option>LOCKED</option><option>DISABLED</option></select></span></li>)}</ul>{users.isPending && <LoadingState label="Loading users…" />}{users.isError && <div className="inline-actions"><p className="form-error" role="alert">Unable to load users.</p><Button type="button" variant="secondary" onClick={() => void users.refetch()}>Try again</Button></div>}{users.data && users.data.content.length === 0 && <p className="muted">No users match this search.</p>}{users.data && totalPages > 1 && <nav className="pagination" aria-label="Administration user pages"><Button type="button" variant="secondary" onClick={() => setPage(current => current - 1)} disabled={page === 0 || users.isFetching}>Previous</Button><span aria-live="polite">Page {page + 1} of {totalPages}{users.data.totalElements === undefined ? '' : ` · ${users.data.totalElements} users`}</span><Button type="button" variant="secondary" onClick={() => setPage(current => current + 1)} disabled={page + 1 >= totalPages || users.isFetching}>Next</Button></nav>}</div></section>
}
