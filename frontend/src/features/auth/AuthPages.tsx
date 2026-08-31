import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { authApi } from './api'
import { useAuth } from './AuthContext'
import { ApiError } from '../../lib/api'
import { Alert, Button } from '../../components/ui'
import { applicationRevision } from '../../app/lazyWithRecovery'
import { safeReturnTo } from './returnTo'
import { AuthField } from './AuthField'

function useFormError() {
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  return { error, setError, fieldErrors, setFieldErrors, clear: () => { setError(''); setFieldErrors({}) } }
}
function problemMessage(caught: unknown, fallback: string) { if (caught instanceof ApiError && caught.correlationId) return `${caught.message} (reference ${caught.correlationId})`; return caught instanceof Error ? caught.message : fallback }
function captureFormError(caught: unknown, fallback: string, setError: (message: string) => void, setFieldErrors: (errors: Record<string, string>) => void) {
  if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors)
  setError(problemMessage(caught, fallback))
}

function loginNotice(reason: string | null) {
  switch (reason) {
    case 'password-changed': return { title: 'Password changed', message: 'Sign in again with your new password.' }
    case 'password-reset': return { title: 'Password reset', message: 'Your password was updated. Sign in to continue.' }
    case 'google-unlinked': return { title: 'Google unlinked', message: 'Google was removed and all other sessions were signed out.' }
    case 'google-link-required': return { title: 'Link Google', message: 'After signing in, open Account Security to link your Google account.' }
    case 'sessions-revoked': return { title: 'Sessions revoked', message: 'All refresh sessions were revoked. Sign in again to continue.' }
    default: return null
  }
}

export function LoginPage() {
  const { login, providers, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { error, setError, fieldErrors, setFieldErrors, clear } = useFormError()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const notice = loginNotice(searchParams.get('reason'))
  // Mutation success redirects intentionally carry a notice while logout
  // clears the current auth context. Do not replace that route with the
  // generic authenticated redirect during the brief cleanup window.
  if (user && !notice) return <NavigateHome returnTo={searchParams.get('returnTo')} />
  async function submit(event: FormEvent) {
    event.preventDefault(); clear()
    setPending(true)
    try { await login(email, password); navigate(safeReturnTo(searchParams.get('returnTo'))) } catch (caught) { captureFormError(caught, 'Unable to sign in', setError, setFieldErrors) } finally { setPending(false) }
  }
  return <AuthCard title="Sign in" subtitle="Use your TestOps account to continue.">
    <form className="form-stack" onSubmit={submit}>
      {notice && <Alert tone="success" title={notice.title}>{notice.message}</Alert>}
      <AuthField id="login-email" label="Email" name="email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} error={fieldErrors.email} />
      <AuthField id="login-password" label="Password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} error={fieldErrors.password} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" busy={pending}>Sign in</Button>
      <p className="form-help"><Link to="/password-reset">Forgot your password?</Link></p>
      {providers?.googleEnabled && <a className="button button-secondary" href="/oauth2/authorization/google">Continue with Google</a>}
      {providers?.registrationEnabled && <p className="form-help">New here? <Link to="/register">Create an account</Link>.</p>}
      <p className="form-help" data-testid="retained-swap-revision-b">
        Deployment recovery ready · build <code>{applicationRevision === 'development' ? 'development' : applicationRevision.slice(0, 12)}</code>
      </p>
    </form>
  </AuthCard>
}

export function RegisterPage() {
  const { register, providers } = useAuth()
  const navigate = useNavigate()
  const { error, setError, fieldErrors, setFieldErrors, clear } = useFormError()
  const [form, setForm] = useState({ email: '', displayName: '', password: '' })
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); clear()
    setPending(true)
    try { await register(form.email, form.displayName, form.password); setSent(true); navigate(`/verify-email?email=${encodeURIComponent(form.email)}`) }
    catch (caught) { captureFormError(caught, 'Unable to register', setError, setFieldErrors) } finally { setPending(false) }
  }
  if (!providers?.registrationEnabled && !sent) return <AuthCard title="Registration unavailable" subtitle="An administrator has not enabled new accounts yet." />
  return <AuthCard title="Create your account" subtitle="We will email a six-digit verification code before your first session.">
    <form className="form-stack" onSubmit={submit}>
      <AuthField id="register-display-name" label="Display name" name="displayName" autoComplete="name" required minLength={2} maxLength={100} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} error={fieldErrors.displayName} />
      <AuthField id="register-email" label="Email" name="email" type="email" autoComplete="email" spellCheck={false} required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} error={fieldErrors.email} />
      <AuthField id="register-password" label="Password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} error={fieldErrors.password} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" busy={pending}>Send verification code</Button>
      <p className="form-help">Already registered? <Link to="/login">Sign in</Link>.</p>
    </form>
  </AuthCard>
}

export function VerifyEmailPage() {
  const { verifyEmail, resendEmail, resendAuthenticatedEmail, user } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { error, setError, fieldErrors, setFieldErrors, clear } = useFormError()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [otp, setOtp] = useState('')
  const [message, setMessage] = useState('')
  const [autoResent, setAutoResent] = useState(false)
  const [pending, setPending] = useState(false)
  const [resendPending, setResendPending] = useState(false)
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0)
  const returnTo = safeReturnTo(searchParams.get('returnTo'))
  useEffect(() => {
    if (retryAfterSeconds <= 0) return
    const timer = window.setInterval(() => setRetryAfterSeconds(current => Math.max(0, current - 1)), 1_000)
    return () => window.clearInterval(timer)
  }, [retryAfterSeconds])
  useEffect(() => {
    if (!user || user.emailVerified || searchParams.get('recover') !== '1' || autoResent || !email) return
    setAutoResent(true)
    void resendAuthenticatedEmail().then(response => {
      setRetryAfterSeconds(response.retryAfterSeconds)
      setMessage(response.message)
    }).catch(caught => setError(caught instanceof Error ? caught.message : 'Unable to resend code'))
  }, [autoResent, email, resendAuthenticatedEmail, searchParams, setError, user])
  async function verify(event: FormEvent) {
    event.preventDefault(); clear()
    setPending(true)
    try { await verifyEmail(email, otp); navigate(returnTo) } catch (caught) { captureFormError(caught, 'Unable to verify email', setError, setFieldErrors) } finally { setPending(false) }
  }
  async function resend() {
    clear(); setMessage('')
    setResendPending(true)
    try {
      const response = await resendEmail(email)
      setRetryAfterSeconds(response.retryAfterSeconds)
      setMessage(response.message)
    }
    catch (caught) { captureFormError(caught, 'Unable to resend code', setError, setFieldErrors) } finally { setResendPending(false) }
  }
  return <AuthCard title="Verify your email" subtitle="Enter the six-digit code sent to your inbox. Codes expire after ten minutes.">
    <form className="form-stack" onSubmit={verify}>
      <AuthField id="verify-email" label="Email" name="email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} error={fieldErrors.email} />
      <AuthField id="verify-otp" label="Verification code" name="otp" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} error={fieldErrors.otp} />
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-help" role="status">{message}</p>}
      <Button type="submit" busy={pending}>Verify and sign in</Button>
      <Button type="button" variant="secondary" busy={resendPending} disabled={retryAfterSeconds > 0}
        onClick={() => void resend()}>
        {retryAfterSeconds > 0 ? `Resend available in ${retryAfterSeconds}s` : 'Resend code'}
      </Button>
    </form>
  </AuthCard>
}

export function PasswordResetPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { error, setError, fieldErrors, setFieldErrors, clear } = useFormError()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0)
  useEffect(() => {
    if (retryAfterSeconds <= 0) return
    const timer = window.setInterval(() => setRetryAfterSeconds(current => Math.max(0, current - 1)), 1_000)
    return () => window.clearInterval(timer)
  }, [retryAfterSeconds])
  async function requestCode(event: FormEvent) {
    event.preventDefault(); clear(); setPending(true)
    try {
      const response = await authApi.requestPasswordReset(email)
      setMessage(response.message); setRetryAfterSeconds(response.retryAfterSeconds); setSent(true)
    } catch (caught) { captureFormError(caught, 'Unable to request a reset code', setError, setFieldErrors) } finally { setPending(false) }
  }
  async function confirm(event: FormEvent) {
    event.preventDefault(); clear(); setPending(true)
    try { await authApi.confirmPasswordReset({ email, otp, password }); navigate(`/login?reason=password-reset&email=${encodeURIComponent(email)}`, { replace: true }) }
    catch (caught) { captureFormError(caught, 'Unable to reset your password', setError, setFieldErrors) } finally { setPending(false) }
  }
  return <AuthCard title="Reset your password" subtitle="We will email a six-digit code to your verified account. Codes expire after ten minutes.">
    {!sent ? <form className="form-stack" onSubmit={requestCode}>
      <AuthField id="reset-request-email" label="Email" name="email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={event => setEmail(event.target.value)} error={fieldErrors.email} />
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-help" role="status">{message}</p>}
      <Button type="submit" busy={pending}>Send reset code</Button>
      <p className="form-help"><Link to={`/login?email=${encodeURIComponent(email)}`}>Back to sign in</Link></p>
    </form> : <form className="form-stack" onSubmit={confirm}>
      <AuthField id="reset-email" label="Email" name="email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={event => setEmail(event.target.value)} error={fieldErrors.email} />
      <AuthField id="reset-otp" label="Reset code" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} error={fieldErrors.otp} />
      <AuthField id="reset-password" label="New password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} error={fieldErrors.password} />
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-help" role="status">{message}</p>}
      <Button type="submit" busy={pending}>Reset password</Button>
      <Button type="button" variant="secondary" disabled={retryAfterSeconds > 0 || pending} onClick={() => { setSent(false); setMessage('') }}>{retryAfterSeconds > 0 ? `Request again in ${retryAfterSeconds}s` : 'Request a new code'}</Button>
      <p className="form-help"><button className="link-button" type="button" onClick={() => navigate(`/login?email=${encodeURIComponent(email)}`)}>Back to sign in</button></p>
    </form>}
  </AuthCard>
}

export function OAuthCallbackPage() {
  const { reloadUser } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const oauthError = searchParams.get('oauth_error')
  useEffect(() => {
    if (oauthError) return
    void authApi.refresh().then(() => reloadUser()).then(() => navigate('/')).catch(() => setError('oauth_sign_in_failed'))
  }, [navigate, oauthError, reloadUser])
  const recovery = oauthRecovery(error ?? oauthError)
  if (recovery) return <AuthCard title="Google sign-in needs attention" subtitle={recovery.message}>
    <div className="form-actions">
      <Link className="button button-secondary" to="/login">Try Google again</Link>
      {recovery.passwordSignIn && <Link className="button" to="/login?reason=google-link-required&returnTo=%2Faccount%23security">Sign in with password</Link>}
    </div>
  </AuthCard>
  return <AuthCard title="Signing you in" subtitle="Completing Google sign-in…" />
}

function oauthRecovery(reason: string | null) {
  switch (reason) {
    case 'account_link_required':
      return { message: 'This email already has a password account. Sign in with your password, then link Google from Account Security.', passwordSignIn: true }
    case 'account_unavailable':
      return { message: 'This account is unavailable. Contact an administrator for help.', passwordSignIn: false }
    case 'email_unverified':
      return { message: 'Choose a Google account with a verified email address, then try again.', passwordSignIn: false }
    case 'oauth_sign_in_failed':
      return { message: 'Google sign-in could not be completed. Try again or sign in with your password.', passwordSignIn: true }
    default:
      return null
  }
}

function NavigateHome({ returnTo }: { returnTo: string | null }) {
  const location = useLocation()
  const navigate = useNavigate()
  const destination = safeReturnTo(returnTo)
  useEffect(() => { if (location.pathname !== destination) navigate(destination, { replace: true }) }, [destination, location.pathname, navigate])
  return null
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return <section className="card auth-card"><p className="eyebrow">Account</p><h1>{title}</h1><p className="lede">{subtitle}</p>{children}</section>
}
