import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { authApi } from './api'
import { useAuth } from './AuthContext'
import { ApiError } from '../../lib/api'
import { Button } from '../../components/ui'
import { safeReturnTo } from './returnTo'

function useFormError() {
  const [error, setError] = useState('')
  return { error, setError, clear: () => setError('') }
}
function problemMessage(caught: unknown, fallback: string) { if (caught instanceof ApiError && caught.correlationId) return `${caught.message} (reference ${caught.correlationId})`; return caught instanceof Error ? caught.message : fallback }

export function LoginPage() {
  const { login, providers, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { error, setError, clear } = useFormError()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  if (user) return <NavigateHome returnTo={searchParams.get('returnTo')} />
  async function submit(event: FormEvent) {
    event.preventDefault(); clear()
    setPending(true)
    try { await login(email, password); navigate(safeReturnTo(searchParams.get('returnTo'))) } catch (caught) { setError(problemMessage(caught, 'Unable to sign in')) } finally { setPending(false) }
  }
  return <AuthCard title="Sign in" subtitle="Use your TestOps account to continue.">
    <form className="form-stack" onSubmit={submit}>
      <label>Email<input name="email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" busy={pending}>Sign in</Button>
      <p className="form-help"><Link to="/password-reset">Forgot your password?</Link></p>
      {providers?.googleEnabled && <a className="button button-secondary" href="/oauth2/authorization/google">Continue with Google</a>}
      {providers?.registrationEnabled && <p className="form-help">New here? <Link to="/register">Create an account</Link>.</p>}
    </form>
  </AuthCard>
}

export function RegisterPage() {
  const { register, providers } = useAuth()
  const navigate = useNavigate()
  const { error, setError, clear } = useFormError()
  const [form, setForm] = useState({ email: '', displayName: '', password: '' })
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); clear()
    setPending(true)
    try { await register(form.email, form.displayName, form.password); setSent(true); navigate(`/verify-email?email=${encodeURIComponent(form.email)}`) }
    catch (caught) { setError(problemMessage(caught, 'Unable to register')) } finally { setPending(false) }
  }
  if (!providers?.registrationEnabled && !sent) return <AuthCard title="Registration unavailable" subtitle="An administrator has not enabled new accounts yet." />
  return <AuthCard title="Create your account" subtitle="We will email a six-digit verification code before your first session.">
    <form className="form-stack" onSubmit={submit}>
      <label>Display name<input name="displayName" autoComplete="name" required minLength={2} maxLength={100} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" spellCheck={false} required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
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
  const { error, setError, clear } = useFormError()
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
    try { await verifyEmail(email, otp); navigate(returnTo) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to verify email') } finally { setPending(false) }
  }
  async function resend() {
    clear(); setMessage('')
    setResendPending(true)
    try {
      const response = await resendEmail(email)
      setRetryAfterSeconds(response.retryAfterSeconds)
      setMessage(response.message)
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to resend code') } finally { setResendPending(false) }
  }
  return <AuthCard title="Verify your email" subtitle="Enter the six-digit code sent to your inbox. Codes expire after ten minutes.">
    <form className="form-stack" onSubmit={verify}>
      <label>Email<input name="email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Verification code<input name="otp" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} /></label>
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
  const { error, setError, clear } = useFormError()
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
    } catch (caught) { setError(problemMessage(caught, 'Unable to request a reset code')) } finally { setPending(false) }
  }
  async function confirm(event: FormEvent) {
    event.preventDefault(); clear(); setPending(true)
    try { await authApi.confirmPasswordReset({ email, otp, password }); setMessage('Password reset. You can now sign in.'); setSent(false); setOtp(''); setPassword('') }
    catch (caught) { setError(problemMessage(caught, 'Unable to reset your password')) } finally { setPending(false) }
  }
  return <AuthCard title="Reset your password" subtitle="We will email a six-digit code to your verified account. Codes expire after ten minutes.">
    {!sent ? <form className="form-stack" onSubmit={requestCode}>
      <label>Email<input name="email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={event => setEmail(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-help" role="status">{message}</p>}
      <Button type="submit" busy={pending}>Send reset code</Button>
      <p className="form-help"><Link to={`/login?email=${encodeURIComponent(email)}`}>Back to sign in</Link></p>
    </form> : <form className="form-stack" onSubmit={confirm}>
      <label>Email<input name="email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Reset code<input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} /></label>
      <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-help" role="status">{message}</p>}
      <Button type="submit" busy={pending}>Reset password</Button>
      <Button type="button" variant="secondary" disabled={retryAfterSeconds > 0 || pending} onClick={() => { setSent(false); setMessage('') }}>{retryAfterSeconds > 0 ? `Request again in ${retryAfterSeconds}s` : 'Request a new code'}</Button>
      <p className="form-help"><button className="link-button" type="button" onClick={() => navigate(`/login?email=${encodeURIComponent(email)}`)}>Back to sign in</button></p>
    </form>}
  </AuthCard>
}

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('Completing Google sign-in…')
  useEffect(() => {
    const oauthError = searchParams.get('oauth_error')
    if (oauthError) { setError('Google sign-in could not be completed.'); return }
    void authApi.refresh().then(() => navigate('/')).catch(() => setError('Google sign-in could not be completed.'))
  }, [navigate, searchParams])
  return <AuthCard title="Signing you in" subtitle={error} />
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
