import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAuth } from './AuthContext'
import { AuthProvider } from './AuthProvider'
import { authApi } from './api'
import { apiFetch } from '../../lib/api'

function LogoutProbe() {
  const { logout } = useAuth()
  return <button type="button" onClick={() => void logout()}>Sign out</button>
}

function SessionProbe() {
  const { user } = useAuth()
  return <span>{user ? `Authenticated as ${user.email}` : 'Signed out'}</span>
}

function LoginProbe() {
  const { login } = useAuth()
  return <button type="button" onClick={() => void login('user@example.test', 'password')}>Sign in</button>
}

afterEach(() => vi.restoreAllMocks())

describe('AuthProvider', () => {
  it('clears the stale bearer token before requesting cookie logout', async () => {
    vi.spyOn(authApi, 'providers').mockResolvedValue({
      enabled: false,
      registrationEnabled: false,
      emailVerificationEnabled: false,
      googleEnabled: false,
    })
    const clearAccessToken = vi.spyOn(authApi, 'clearAccessToken').mockImplementation(() => undefined)
    const logout = vi.spyOn(authApi, 'logout').mockImplementation(async () => {
      expect(clearAccessToken).toHaveBeenCalledTimes(1)
    })

    render(<AuthProvider><LogoutProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
    expect(clearAccessToken.mock.invocationCallOrder[0]).toBeLessThan(logout.mock.invocationCallOrder[0])
  })

  it('clears the authenticated UI when the shared API reports a terminal refresh failure', async () => {
    vi.spyOn(authApi, 'providers').mockResolvedValue({ enabled: true, registrationEnabled: false, emailVerificationEnabled: true, googleEnabled: false })
    vi.spyOn(authApi, 'refresh').mockResolvedValue({
      accessToken: 'access', expiresInSeconds: 900,
      user: { id: '1', email: 'user@example.test', displayName: 'User', emailVerified: true, status: 'ACTIVE', platformRole: 'MEMBER', loginMethods: ['PASSWORD'], platformPermissions: [] },
    })
    render(<AuthProvider><SessionProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('Authenticated as user@example.test')).toBeVisible())

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 })))
    await expect(apiFetch('/api/v1/projects')).rejects.toMatchObject({ status: 401 })
    await waitFor(() => expect(screen.getByText('Signed out')).toBeVisible())
  })

  it('does not start bootstrap refresh after login hydrates the session', async () => {
    let resolveProviders!: (value: Awaited<ReturnType<typeof authApi.providers>>) => void
    vi.spyOn(authApi, 'providers').mockImplementation(() => new Promise(resolve => { resolveProviders = resolve }))
    const refresh = vi.spyOn(authApi, 'refresh').mockResolvedValue({
      accessToken: 'refresh-token', expiresInSeconds: 900,
      user: { id: '1', email: 'user@example.test', displayName: 'User', emailVerified: true, status: 'ACTIVE', platformRole: 'MEMBER', loginMethods: ['PASSWORD'], platformPermissions: [] },
    })
    vi.spyOn(authApi, 'login').mockResolvedValue({
      accessToken: 'login-token', expiresInSeconds: 900,
      user: { id: '1', email: 'user@example.test', displayName: 'User', emailVerified: true, status: 'ACTIVE', platformRole: 'MEMBER', loginMethods: ['PASSWORD'], platformPermissions: [] },
    })

    render(<AuthProvider><LoginProbe /></AuthProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText('Sign in')).toBeVisible())
    resolveProviders({ enabled: true, registrationEnabled: false, emailVerificationEnabled: true, googleEnabled: false })
    await waitFor(() => expect(refresh).not.toHaveBeenCalled())
  })
})
