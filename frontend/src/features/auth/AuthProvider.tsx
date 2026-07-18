import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

import { ApiError } from '../../lib/api'
import { authApi, type Providers, type UserSummary } from './api'
import { AuthContext, type AuthContextValue } from './AuthContext'

function saveSession(response: { accessToken: string; user: UserSummary }) {
  sessionStorage.setItem('testops.accessToken', response.accessToken)
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<UserSummary | null>(null)
  const [providers, setProviders] = useState<Providers | null>(null)
  const [loading, setLoading] = useState(true)

  const bootstrap = useCallback(async () => {
    try {
      const configured = await authApi.providers()
      setProviders(configured)
      if (!configured.enabled) return
      const refreshed = await authApi.refresh()
      saveSession(refreshed)
      setUser(refreshed.user)
    } catch (error) {
      authApi.clearAccessToken()
      if (!(error instanceof ApiError) || error.status !== 404) setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void bootstrap() }, [bootstrap])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    providers,
    loading,
    login: async (email, password) => {
      const response = await authApi.login({ email, password })
      saveSession(response)
      setUser(response.user)
    },
    register: async (email, displayName, password) => { await authApi.register({ email, displayName, password }) },
    verifyEmail: async (email, otp) => {
      const response = await authApi.verifyEmail({ email, otp })
      saveSession(response)
      setUser(response.user)
    },
    resendEmail: async (email) => { await authApi.resendEmail(email) },
    logout: async () => {
      try { await authApi.logout() } finally { authApi.clearAccessToken(); setUser(null) }
    },
  }), [loading, providers, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
