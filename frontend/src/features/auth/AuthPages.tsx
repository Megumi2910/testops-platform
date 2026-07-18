import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { authApi } from './api'
import { useAuth } from './AuthContext'

function useFormError() {
  const [error, setError] = useState('')
  return { error, setError, clear: () => setError('') }
}

export function LoginPage() {
  const { login, providers, user } = useAuth()
  const navigate = useNavigate()
  const { error, setError, clear } = useFormError()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  if (user) return <NavigateHome />
  async function submit(event: FormEvent) {
    event.preventDefault(); clear()
    try { await login(email, password); navigate('/') } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to sign in') }
  }
  return <AuthCard title="Sign in" subtitle="Use your TestOps account to continue.">
    <form className="form-stack" onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit">Sign in</button>
      {providers?.googleEnabled && <a className="button secondary" href="/oauth2/authorization/google">Continue with Google</a>}
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
  async function submit(event: FormEvent) {
    event.preventDefault(); clear()
    try { await register(form.email, form.displayName, form.password); setSent(true); navigate(`/verify-email?email=${encodeURIComponent(form.email)}`) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to register') }
  }
  if (!providers?.registrationEnabled && !sent) return <AuthCard title="Registration unavailable" subtitle="An administrator has not enabled new accounts yet." />
  return <AuthCard title="Create your account" subtitle="We will email a six-digit verification code before your first session.">
    <form className="form-stack" onSubmit={submit}>
      <label>Display name<input required minLength={2} maxLength={100} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
      <label>Email<input type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Password<input type="password" autoComplete="new-password" minLength={12} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit">Send verification code</button>
      <p className="form-help">Already registered? <Link to="/login">Sign in</Link>.</p>
    </form>
  </AuthCard>
}

export function VerifyEmailPage() {
  const { verifyEmail, resendEmail } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { error, setError, clear } = useFormError()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [otp, setOtp] = useState('')
  const [message, setMessage] = useState('')
  async function verify(event: FormEvent) {
    event.preventDefault(); clear()
    try { await verifyEmail(email, otp); navigate('/') } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to verify email') }
  }
  async function resend() {
    clear(); setMessage('')
    try { await resendEmail(email); setMessage('If the account can be verified, a new code is on its way.') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to resend code') }
  }
  return <AuthCard title="Verify your email" subtitle="Enter the six-digit code sent to your inbox. Codes expire after ten minutes.">
    <form className="form-stack" onSubmit={verify}>
      <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Verification code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-help" role="status">{message}</p>}
      <button type="submit">Verify and sign in</button>
      <button type="button" className="secondary" onClick={() => void resend()}>Resend code</button>
    </form>
  </AuthCard>
}

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const { providers } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('Completing Google sign-in…')
  useEffect(() => {
    const code = searchParams.get('code')
    if (!code || !providers?.googleEnabled) { setError('Google sign-in is unavailable.'); return }
    void authApi.exchangeOAuth(code).then(() => navigate('/')).catch((caught) => setError(caught instanceof Error ? caught.message : 'Google sign-in failed'))
  }, [navigate, providers?.googleEnabled, searchParams])
  return <AuthCard title="Signing you in" subtitle={error} />
}

function NavigateHome() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => { if (location.pathname !== '/') navigate('/') }, [location.pathname, navigate])
  return null
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return <section className="card auth-card"><p className="eyebrow">Account</p><h1>{title}</h1><p className="lede">{subtitle}</p>{children}</section>
}
