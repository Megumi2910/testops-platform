import { createContext, useContext } from 'react'

import type { Providers, ResendVerificationResponse, UserSummary } from './api'

export type AuthContextValue = {
  user: UserSummary | null
  providers: Providers | null
  loading: boolean
  reloadUser: () => Promise<UserSummary>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, displayName: string, password: string) => Promise<void>
  verifyEmail: (email: string, otp: string) => Promise<void>
  resendEmail: (email: string) => Promise<ResendVerificationResponse>
  resendAuthenticatedEmail: () => Promise<ResendVerificationResponse>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
