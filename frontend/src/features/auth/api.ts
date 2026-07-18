import { apiFetch, clearAccessToken } from '../../lib/api'

export type UserSummary = {
  id: string
  email: string
  displayName: string
  emailVerified: boolean
  roles: string[]
}

export type AuthResponse = {
  accessToken: string
  expiresInSeconds: number
  user: UserSummary
}

export type Providers = {
  enabled: boolean
  registrationEnabled: boolean
  emailVerificationEnabled: boolean
  googleEnabled: boolean
}

export const authApi = {
  providers: () => apiFetch<Providers>('/api/v1/auth/providers'),
  register: (payload: { email: string; displayName: string; password: string }) =>
    apiFetch<{ message: string }>('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  verifyEmail: (payload: { email: string; otp: string }) =>
    apiFetch<AuthResponse>('/api/v1/auth/email/verify', { method: 'POST', body: JSON.stringify(payload) }),
  resendEmail: (email: string) =>
    apiFetch<{ message: string }>('/api/v1/auth/email/resend', { method: 'POST', body: JSON.stringify({ email }) }),
  login: (payload: { email: string; password: string }) =>
    apiFetch<AuthResponse>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  refresh: () => apiFetch<AuthResponse>('/api/v1/auth/refresh', { method: 'POST' }),
  me: () => apiFetch<UserSummary>('/api/v1/auth/me'),
  logout: () => apiFetch<void>('/api/v1/auth/logout', { method: 'POST' }),
  revokeAll: () => apiFetch<void>('/api/v1/auth/sessions/revoke-all', { method: 'POST' }),
  exchangeOAuth: (code: string) =>
    apiFetch<AuthResponse>('/api/v1/auth/oauth/exchange', { method: 'POST', body: JSON.stringify({ code }) }),
  clearAccessToken,
}
