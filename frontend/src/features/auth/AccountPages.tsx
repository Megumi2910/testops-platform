import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { authApi } from './api'
import { apiFetch, ApiError } from '../../lib/api'
import { useAuth } from './AuthContext'
import { Alert, Button, ConfirmDialog, LoadingState, PageHeader } from '../../components/ui'

type AdminUser = { id: string; email: string; displayName: string; status: string; platformRole: string; emailVerified: boolean; createdAt: string; lastLoginAt?: string }
type AdminUsersResponse = { content: AdminUser[]; page?: number; totalPages?: number; totalElements?: number }
type AdminUserFeedback = { tone: 'success' | 'danger'; message: string }
type AdminUserChange = {
  user: AdminUser
  path: 'platform-role' | 'status'
  body: Record<string, string>
  successMessage: string
  title: string
  description: string
  confirmLabel: string
}

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

function localFormProblem(cause: unknown, fallback: string) {
  const fieldErrors = cause instanceof ApiError ? cause.fieldErrors : {}
  const message = Object.keys(fieldErrors).length > 0 ? '' : cause instanceof ApiError ? cause.message : fallback
  return { fieldErrors, message }
}

function setupResendDeadline(nextResendAt: string, retryAfterSeconds: number) {
  const serverDeadline = Date.parse(nextResendAt)
  return Number.isFinite(serverDeadline) ? serverDeadline : Date.now() + Math.max(0, retryAfterSeconds) * 1_000
}

function cooldownSeconds(deadline: number) {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1_000))
}

function AccountField({ id, label, error, ...inputProps }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string }) {
  const errorId = `${id}-error`
  return <div>
    <label htmlFor={id}>{label}<input {...inputProps} id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} /></label>
    {error && <small id={errorId} className="form-error" role="alert">{error}</small>}
  </div>
}

export function AccountPage() {
  const { user, providers, logout, reloadUser } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [passwordPending, setPasswordPending] = useState(false)
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Record<string, string>>({})
  const [passwordFormError, setPasswordFormError] = useState('')
  const [setupOtp, setSetupOtp] = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupSent, setSetupSent] = useState(false)
  const [setupPending, setSetupPending] = useState(false)
  const [setupRetryAfterSeconds, setSetupRetryAfterSeconds] = useState(0)
  const [setupResendDeadlineMs, setSetupResendDeadlineMs] = useState<number | null>(null)
  const [setupMessage, setSetupMessage] = useState('')
  const [setupFieldErrors, setSetupFieldErrors] = useState<Record<string, string>>({})
  const [setupFormError, setSetupFormError] = useState('')
  const [linkPending, setLinkPending] = useState(false)
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [unlinkPassword, setUnlinkPassword] = useState('')
  const [unlinkPending, setUnlinkPending] = useState(false)
  const [unlinkFieldErrors, setUnlinkFieldErrors] = useState<Record<string, string>>({})
  const [unlinkFormError, setUnlinkFormError] = useState('')
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

  useEffect(() => {
    if (setupResendDeadlineMs === null) return
    const refreshCooldown = () => setSetupRetryAfterSeconds(cooldownSeconds(setupResendDeadlineMs))
    refreshCooldown()
    const timer = window.setInterval(refreshCooldown, 1_000)
    window.addEventListener('focus', refreshCooldown)
    document.addEventListener('visibilitychange', refreshCooldown)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshCooldown)
      document.removeEventListener('visibilitychange', refreshCooldown)
    }
  }, [setupResendDeadlineMs])

  if (!user) return null
  const clearFeedback = () => { setError(''); setMessage('') }
  const reportError = (cause: unknown, fallback: string) => setError(cause instanceof ApiError ? cause.message : fallback)

  async function submitPasswordChange(event: FormEvent) {
    event.preventDefault()
    clearFeedback()
    setPasswordFieldErrors({})
    setPasswordFormError('')
    if (newPassword !== passwordConfirmation) {
      setPasswordFieldErrors({ passwordConfirmation: 'New password and confirmation must match.' })
      return
    }
    setPasswordPending(true)
    try {
      await authApi.changePassword({ currentPassword, newPassword })
      // The mutation revokes every refresh session, including this browser's
      // cookie. Logout is still attempted for cleanup, but its expected
      // invalid-session response must not replace the success redirect.
      navigate('/login?reason=password-changed', { replace: true })
      await logout().catch(() => undefined)
    } catch (cause) {
      const problem = localFormProblem(cause, 'Unable to change your password. Try again.')
      setPasswordFieldErrors(problem.fieldErrors)
      setPasswordFormError(problem.message)
    }
    finally { setPasswordPending(false) }
  }

  async function sendPasswordSetupCode() {
    if (setupPending || setupRetryAfterSeconds > 0) return
    clearFeedback(); setSetupMessage(''); setSetupFieldErrors({}); setSetupFormError(''); setSetupPending(true)
    try {
      const response = await authApi.passwordChallenge()
      const deadline = setupResendDeadline(response.nextResendAt, response.retryAfterSeconds)
      setSetupSent(true)
      setSetupMessage(response.message)
      setSetupResendDeadlineMs(deadline)
      setSetupRetryAfterSeconds(cooldownSeconds(deadline))
    }
    catch (cause) {
      const problem = localFormProblem(cause, 'Unable to send a password setup code. Try again.')
      setSetupFieldErrors(problem.fieldErrors)
      setSetupFormError(problem.message)
    }
    finally { setSetupPending(false) }
  }

  async function confirmPasswordSetup(event: FormEvent) {
    event.preventDefault(); clearFeedback(); setSetupFieldErrors({}); setSetupFormError(''); setSetupPending(true)
    try {
      await authApi.passwordConfirm({ otp: setupOtp, password: setupPassword })
      await reloadUser()
      setSetupSent(false); setSetupOtp(''); setSetupPassword(''); setSetupMessage(''); setSetupRetryAfterSeconds(0); setSetupResendDeadlineMs(null); setMessage('Password login added to your account.')
    } catch (cause) {
      const problem = localFormProblem(cause, 'Unable to add a password login. Check the code and try again.')
      setSetupFieldErrors(problem.fieldErrors)
      setSetupFormError(problem.message)
    }
    finally { setSetupPending(false) }
  }

  async function linkGoogle() {
    clearFeedback(); setLinkPending(true)
    try { await authApi.linkGoogle() } catch (cause) { reportError(cause, 'Google linking is unavailable. Try again later.'); setLinkPending(false) }
  }

  async function confirmGoogleUnlink() {
    clearFeedback(); setUnlinkFieldErrors({}); setUnlinkFormError('')
    if (!unlinkPassword.trim()) {
      setUnlinkFieldErrors({ currentPassword: 'Enter your current password to unlink Google.' })
      return
    }
    setUnlinkPending(true)
    try {
      await authApi.unlinkGoogle(unlinkPassword)
      navigate('/login?reason=google-unlinked', { replace: true })
      await logout().catch(() => undefined)
    } catch (cause) {
      const problem = localFormProblem(cause, 'Unable to unlink Google. Check your password and try again.')
      setUnlinkFieldErrors(problem.fieldErrors)
      setUnlinkFormError(problem.message)
    }
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
    try { await authApi.revokeAll(); navigate('/login?reason=sessions-revoked', { replace: true }); await logout().catch(() => undefined) }
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
        {!user.loginMethods.includes('GOOGLE') && providers?.googleEnabled && <Button type="button" busy={linkPending} onClick={() => void linkGoogle()}>Link Google</Button>}
        {user.loginMethods.includes('GOOGLE') && user.loginMethods.includes('PASSWORD') && <Button type="button" variant="secondary" onClick={() => { setUnlinkFieldErrors({}); setUnlinkFormError(''); setUnlinkOpen(true) }}>Unlink Google</Button>}
      </div>
    </section>
    {user.loginMethods.includes('PASSWORD') ? <section className="card account-card" aria-labelledby="change-password-title">
      <h2 id="change-password-title">Change password</h2>
      <p className="muted">Changing your password signs out every refresh session, including this browser.</p>
      <form className="form-stack" onSubmit={submitPasswordChange}>
        <AccountField id="current-password" label="Current password" name="currentPassword" type="password" autoComplete="current-password" required value={currentPassword} onChange={event => { setCurrentPassword(event.target.value); setPasswordFieldErrors(current => ({ ...current, currentPassword: '' })); setPasswordFormError('') }} error={passwordFieldErrors.currentPassword} />
        <AccountField id="new-password" label="New password" name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={newPassword} onChange={event => { setNewPassword(event.target.value); setPasswordFieldErrors(current => ({ ...current, newPassword: '' })); setPasswordFormError('') }} error={passwordFieldErrors.newPassword} />
        <AccountField id="password-confirmation" label="Confirm new password" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={passwordConfirmation} onChange={event => { setPasswordConfirmation(event.target.value); setPasswordFieldErrors(current => ({ ...current, passwordConfirmation: '' })); setPasswordFormError('') }} error={passwordFieldErrors.passwordConfirmation} />
        {passwordFormError && <p className="form-error" role="alert">{passwordFormError}</p>}
        <Button type="submit" busy={passwordPending}>Change password</Button>
      </form>
    </section> : <section className="card account-card" aria-labelledby="password-setup-title">
      <h2 id="password-setup-title">Add a password login</h2>
      <p className="muted">Google-only accounts can add a password after confirming a code sent to the verified email.</p>
      {setupMessage && <p className="form-help" role="status">{setupMessage}</p>}
      {setupFormError && <p className="form-error" role="alert">{setupFormError}</p>}
      {!setupSent ? <Button type="button" busy={setupPending} onClick={() => void sendPasswordSetupCode()}>Send setup code</Button> : <form className="form-stack" onSubmit={confirmPasswordSetup}>
        <AccountField id="setup-otp" label="Verification code" name="setupOtp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={setupOtp} onChange={event => { setSetupOtp(event.target.value.replace(/\D/g, '')); setSetupFieldErrors(current => ({ ...current, otp: '' })); setSetupFormError('') }} error={setupFieldErrors.otp} />
        <AccountField id="setup-password" label="New password" name="setupPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={setupPassword} onChange={event => { setSetupPassword(event.target.value); setSetupFieldErrors(current => ({ ...current, password: '' })); setSetupFormError('') }} error={setupFieldErrors.password} />
        <Button type="submit" busy={setupPending}>Confirm password</Button>
        <Button type="button" variant="secondary" busy={setupPending} disabled={setupRetryAfterSeconds > 0} onClick={() => void sendPasswordSetupCode()}>{setupRetryAfterSeconds > 0 ? `Send another code in ${setupRetryAfterSeconds}s` : 'Send another code'}</Button>
      </form>}
    </section>}
    <section className="card account-card account-anchor" id="sessions" aria-labelledby="sessions-title">
      <div className="section-heading"><div><h2 id="sessions-title">Active sessions</h2><p className="muted">Revoke one browser or sign out everywhere.</p></div><Button type="button" variant="secondary" busy={revokeAllPending} onClick={() => void revokeAllSessions()}>Revoke all sessions</Button></div>
      {sessionError && <Alert tone="danger">{sessionError}</Alert>}
      {sessions.isPending && <LoadingState label="Loading sessions…" />}
      {sessions.isError && <div className="inline-actions"><p className="form-error" role="alert">Unable to load sessions.</p><Button type="button" variant="secondary" onClick={() => void sessions.refetch()}>Try again</Button></div>}
      {sessions.data?.length === 0 && <p className="muted">No active sessions.</p>}
      {sessions.data && sessions.data.length > 0 && <ul className="resource-list">{sessions.data.map(session => <li key={session.familyId}><span className="min-w-0"><strong>{session.userAgent || 'Unknown browser'}</strong><span className="muted"> · Signed in {formatSessionDate(session.issuedAt)} · Expires {formatSessionDate(session.expiresAt)} · IP {session.createdIp || 'Unavailable'}</span></span><Button type="button" variant="ghost" busy={sessionPending === session.familyId} onClick={() => void revokeSession(session.familyId)}>Revoke</Button></li>)}</ul>}
    </section>
    <ConfirmDialog open={unlinkOpen} title="Unlink Google?" description="You will be signed out on every device. Enter your current password to confirm." confirmLabel="Unlink Google" busy={unlinkPending} onClose={() => { if (!unlinkPending) { setUnlinkOpen(false); setUnlinkPassword(''); setUnlinkFieldErrors({}); setUnlinkFormError('') } }} onConfirm={() => void confirmGoogleUnlink()}>
      <label className="dialog-field" htmlFor="unlink-password">Current password<input id="unlink-password" name="unlinkPassword" type="password" autoComplete="current-password" required value={unlinkPassword} aria-invalid={unlinkFieldErrors.currentPassword ? true : undefined} aria-describedby={unlinkFieldErrors.currentPassword ? 'unlink-password-error' : undefined} onChange={event => { setUnlinkPassword(event.target.value); setUnlinkFieldErrors(current => ({ ...current, currentPassword: '' })); setUnlinkFormError('') }} /></label>
      {unlinkFieldErrors.currentPassword && <small id="unlink-password-error" className="form-error" role="alert">{unlinkFieldErrors.currentPassword}</small>}
      {unlinkFormError && <p className="form-error" role="alert">{unlinkFormError}</p>}
    </ConfirmDialog>
  </section>
}

export function AdminUsersPage() {
  const client = useQueryClient()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(() => new Set())
  const [feedbackByUser, setFeedbackByUser] = useState<Record<string, AdminUserFeedback>>({})
  const [confirmation, setConfirmation] = useState<AdminUserChange | null>(null)
  const deferredQuery = useDeferredValue(query)
  const queryKey = ['admin-users', deferredQuery, page] as const
  const users = useQuery({
    queryKey,
    queryFn: () => apiFetch<AdminUsersResponse>(`/api/v1/admin/users?page=${page}&size=25${deferredQuery ? `&query=${encodeURIComponent(deferredQuery)}` : ''}`),
    placeholderData: keepPreviousData,
  })
  async function updateUser(user: AdminUser, path: 'platform-role' | 'status', body: Record<string, string>, successMessage: string) {
    setPendingUserIds(current => new Set(current).add(user.id))
    setFeedbackByUser(current => {
      const next = { ...current }
      delete next[user.id]
      return next
    })
    try {
      const updated = await apiFetch<AdminUser>(`/api/v1/admin/users/${user.id}/${path}`, { method: 'PATCH', body: JSON.stringify(body) })
      client.setQueryData<AdminUsersResponse>(queryKey, current => current ? { ...current, content: current.content.map(item => item.id === updated.id ? updated : item) } : current)
      setFeedbackByUser(current => ({ ...current, [user.id]: { tone: 'success', message: successMessage } }))
      void users.refetch()
    } catch (cause) {
      setFeedbackByUser(current => ({ ...current, [user.id]: { tone: 'danger', message: adminMutationError(cause) } }))
    } finally {
      setPendingUserIds(current => {
        const next = new Set(current)
        next.delete(user.id)
        return next
      })
    }
  }

  function changePlatformRole(user: AdminUser, platformRole: string) {
    if (platformRole === user.platformRole) return
    if (user.platformRole === 'ADMIN' && platformRole === 'MEMBER') {
      setConfirmation({
        user,
        path: 'platform-role',
        body: { platformRole },
        successMessage: `${user.displayName} is now a platform member.`,
        title: `Demote ${user.displayName}?`,
        description: `${user.displayName} (${user.email}) will lose platform administrator access. Project roles are unchanged.`,
        confirmLabel: 'Demote to member',
      })
      return
    }
    void updateUser(user, 'platform-role', { platformRole }, `${user.displayName} is now a platform administrator.`)
  }

  function changeAccountStatus(user: AdminUser, status: string) {
    if (status === user.status) return
    if (status === 'LOCKED' || status === 'DISABLED') {
      const action = status === 'LOCKED' ? 'Lock' : 'Disable'
      setConfirmation({
        user,
        path: 'status',
        body: { status },
        successMessage: `${user.displayName}'s account is now ${status.toLowerCase()}.`,
        title: `${action} ${user.displayName}?`,
        description: `${user.displayName} (${user.email}) will be unable to sign in until an administrator restores the account to ACTIVE.`,
        confirmLabel: `${action} account`,
      })
      return
    }
    void updateUser(user, 'status', { status }, `${user.displayName}'s account is now active.`)
  }

  async function applyConfirmedChange() {
    if (!confirmation) return
    const change = confirmation
    await updateUser(change.user, change.path, change.body, change.successMessage)
    setConfirmation(null)
  }

  const totalPages = Math.max(1, users.data?.totalPages ?? 1)
  const confirmationPending = confirmation ? pendingUserIds.has(confirmation.user.id) : false
  return <section className="page-stack">
    <div><p className="eyebrow">Administration</p><h1>Users</h1><p className="lede">Manage platform roles and account status. Project roles remain scoped to each project.</p></div>
    <label className="search-field" htmlFor="admin-user-search">Search users<input id="admin-user-search" name="adminUserSearch" value={query} onChange={event => { setQuery(event.target.value); setPage(0); setFeedbackByUser({}) }} placeholder="Email or display name" autoComplete="off" /></label>
    <div className="card">
      <ul className="resource-list">{users.data?.content.map(user => {
        const feedbackId = `admin-user-${user.id}-feedback`
        const userFeedback = feedbackByUser[user.id]
        return <li key={user.id}>
          <div className="min-w-0">
            <strong>{user.displayName}</strong><span className="muted"> · {user.email}</span>
            {userFeedback && <p id={feedbackId} className={userFeedback.tone === 'danger' ? 'form-error' : 'form-help'} role={userFeedback.tone === 'danger' ? 'alert' : 'status'}>{userFeedback.message}</p>}
          </div>
          <span className="inline-actions">
            <select name={`platformRole-${user.id}`} aria-label={`Platform role for ${user.email}`} aria-describedby={userFeedback ? feedbackId : undefined} value={user.platformRole} disabled={pendingUserIds.has(user.id)} onChange={event => changePlatformRole(user, event.target.value)}><option>MEMBER</option><option>ADMIN</option></select>
            <select name={`accountStatus-${user.id}`} aria-label={`Account status for ${user.email}`} aria-describedby={userFeedback ? feedbackId : undefined} value={user.status} disabled={pendingUserIds.has(user.id)} onChange={event => changeAccountStatus(user, event.target.value)}><option>ACTIVE</option><option>LOCKED</option><option>DISABLED</option></select>
          </span>
        </li>
      })}</ul>
      {users.isPending && <LoadingState label="Loading users…" />}
      {users.isError && <div className="inline-actions"><p className="form-error" role="alert">Unable to load users.</p><Button type="button" variant="secondary" onClick={() => void users.refetch()}>Try again</Button></div>}
      {users.data && users.data.content.length === 0 && <p className="muted">No users match this search.</p>}
      {users.data && totalPages > 1 && <nav className="pagination" aria-label="Administration user pages"><Button type="button" variant="secondary" onClick={() => setPage(current => current - 1)} disabled={page === 0 || users.isFetching}>Previous</Button><span aria-live="polite">Page {page + 1} of {totalPages}{users.data.totalElements === undefined ? '' : ` · ${users.data.totalElements} users`}</span><Button type="button" variant="secondary" onClick={() => setPage(current => current + 1)} disabled={page + 1 >= totalPages || users.isFetching}>Next</Button></nav>}
    </div>
    <ConfirmDialog
      open={Boolean(confirmation)}
      title={confirmation?.title ?? 'Confirm account change'}
      description={confirmation?.description ?? ''}
      confirmLabel={confirmation?.confirmLabel ?? 'Confirm change'}
      busy={confirmationPending}
      onClose={() => { if (!confirmationPending) setConfirmation(null) }}
      onConfirm={() => void applyConfirmedChange()}
    />
  </section>
}
