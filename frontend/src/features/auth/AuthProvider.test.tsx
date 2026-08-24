import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAuth } from './AuthContext'
import { AuthProvider } from './AuthProvider'
import { authApi } from './api'

function LogoutProbe() {
  const { logout } = useAuth()
  return <button type="button" onClick={() => void logout()}>Sign out</button>
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
})
