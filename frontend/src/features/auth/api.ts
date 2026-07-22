import { apiFetch, clearAccessToken, refreshAccessToken, setAccessToken } from '../../lib/api'

export type UserSummary = {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  emailVerified: boolean
  status: string
  platformRole: 'ADMIN' | 'MEMBER'
  loginMethods: string[]
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
  verifyEmail: async (payload: { email: string; otp: string }) => {
    const response = await apiFetch<AuthResponse>('/api/v1/auth/email/verify', { method: 'POST', body: JSON.stringify(payload) })
    setAccessToken(response.accessToken)
    return response
  },
  resendEmail: (email: string) =>
    apiFetch<{ message: string }>('/api/v1/auth/email/resend', { method: 'POST', body: JSON.stringify({ email }) }),
  login: async (payload: { email: string; password: string }) => {
    const response = await apiFetch<AuthResponse>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(payload) })
    setAccessToken(response.accessToken)
    return response
  },
  refresh: () => refreshAccessToken<AuthResponse>(),
  me: () => apiFetch<UserSummary>('/api/v1/auth/me'),
  logout: () => apiFetch<void>('/api/v1/auth/logout', { method: 'POST' }),
  revokeAll: () => apiFetch<void>('/api/v1/auth/sessions/revoke-all', { method: 'POST' }),
  passwordChallenge: () => apiFetch<{ message: string }>('/api/v1/auth/me/password/challenge', { method: 'POST' }),
  passwordConfirm: (payload: { otp: string; password: string }) => apiFetch<void>('/api/v1/auth/me/password/confirm', { method: 'POST', body: JSON.stringify(payload) }),
  changePassword: (payload: { currentPassword: string; newPassword: string }) => apiFetch<void>('/api/v1/auth/me/password', { method: 'PUT', body: JSON.stringify(payload) }),
  unlinkGoogle: (currentPassword: string) => apiFetch<void>('/api/v1/auth/me/login-methods/google/unlink', { method: 'POST', body: JSON.stringify({ currentPassword }) }),
  linkGoogle: async () => { const response = await apiFetch<{ authorizationUrl: string }>('/api/v1/auth/me/login-methods/google/link-intent', { method: 'POST' }); window.location.assign(response.authorizationUrl) },
  clearAccessToken,
}
