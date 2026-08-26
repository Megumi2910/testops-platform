import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'

import { ApiError, subscribeAuthFailure } from '../../lib/api'
import { authApi, type Providers, type UserSummary } from './api'
import { AuthContext, type AuthContextValue } from './AuthContext'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<UserSummary | null>(null)
  const [providers, setProviders] = useState<Providers | null>(null)
  const [loading, setLoading] = useState(true)
  const sessionHydrated = useRef(false)

  const bootstrap = useCallback(async () => {
    try {
      const configured = await authApi.providers()
      setProviders(configured)
      if (!configured.enabled) return
      // Login/OAuth can complete while the initial provider request is in
      // flight. Do not start a second refresh against the just-issued cookie;
      // refresh rotation is single-use and would race the authenticated page.
      if (sessionHydrated.current) return
      const refreshed = await authApi.refresh()
      setUser(refreshed.user)
    } catch (error) {
      authApi.clearAccessToken()
      // OAuth callbacks can hydrate the session while the one-time bootstrap
      // refresh is still settling. Do not let that stale failure erase the
      // user that reloadUser() has already adopted.
      if (!sessionHydrated.current && (!(error instanceof ApiError) || error.status !== 404)) setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void bootstrap() }, [bootstrap])

  useEffect(() => subscribeAuthFailure(() => {
    sessionHydrated.current = false
    setUser(null)
    setLoading(false)
  }), [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    providers,
    loading,
    reloadUser: async () => {
      const refreshed = await authApi.me()
      sessionHydrated.current = true
      setUser(refreshed)
      return refreshed
    },
    login: async (email, password) => {
      const response = await authApi.login({ email, password })
      sessionHydrated.current = true
      setUser(response.user)
    },
    register: async (email, displayName, password) => { await authApi.register({ email, displayName, password }) },
    verifyEmail: async (email, otp) => {
      const response = await authApi.verifyEmail({ email, otp })
      sessionHydrated.current = true
      setUser(response.user)
    },
    resendEmail: (email) => authApi.resendEmail(email),
    resendAuthenticatedEmail: () => authApi.resendAuthenticatedEmail(),
    logout: async () => {
      authApi.clearAccessToken()
      try { await authApi.logout() } finally { sessionHydrated.current = false; setUser(null) }
    },
  }), [loading, providers, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
