import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from './AuthContext'
import { LoginPage, OAuthCallbackPage, PasswordResetPage, VerifyEmailPage } from './AuthPages'
import { authApi } from './api'

describe('VerifyEmailPage', () => {
  it('uses the server retry window to disable repeated resend requests', async () => {
    const resendEmail = vi.fn().mockResolvedValue({
      message: 'If the account can be verified, a code has been sent',
      nextResendAt: '2026-08-11T12:00:30Z',
      retryAfterSeconds: 30,
    })
    const context: AuthContextValue = {
      user: null,
      providers: null,
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      verifyEmail: vi.fn(),
      resendEmail,
      resendAuthenticatedEmail: vi.fn(),
      reloadUser: vi.fn(),
      logout: vi.fn(),
    }

    render(
      <MemoryRouter initialEntries={['/verify-email?email=qa%40example.com']}>
        <AuthContext.Provider value={context}><VerifyEmailPage /></AuthContext.Provider>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))

    await waitFor(() => expect(resendEmail).toHaveBeenCalledWith('qa@example.com'))
    const cooldown = screen.getByRole('button', { name: 'Resend available in 30s' })
    expect(cooldown).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('If the account can be verified')
  })
})

describe('Google authentication', () => {
  it('shows the provider link only when the backend advertises Google', () => {
    const context: AuthContextValue = {
      user: null,
      providers: { enabled: true, registrationEnabled: true, emailVerificationEnabled: true, googleEnabled: true },
      loading: false,
      login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendEmail: vi.fn(),
      resendAuthenticatedEmail: vi.fn(), reloadUser: vi.fn(), logout: vi.fn(),
    }
    render(<MemoryRouter initialEntries={['/login']}><AuthContext.Provider value={context}><LoginPage /></AuthContext.Provider></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/oauth2/authorization/google')
  })

  it('keeps provider errors generic on the callback page', async () => {
    render(<MemoryRouter initialEntries={['/auth/oauth/callback?oauth_error=oauth_sign_in_failed']}><OAuthCallbackPage /></MemoryRouter>)
    expect(await screen.findByText('Google sign-in could not be completed.', { exact: true })).toBeVisible()
    expect(screen.queryByText(/client_secret|token|stack|exception/i)).not.toBeInTheDocument()
  })
})

describe('PasswordResetPage', () => {
  it('moves from a generic reset request to the code form and confirms the new password', async () => {
    const request = vi.spyOn(authApi, 'requestPasswordReset').mockResolvedValue({
      message: 'If the account can be recovered, a reset code has been sent',
      nextResendAt: '2026-08-12T12:00:30Z',
      retryAfterSeconds: 30,
    })
    const confirm = vi.spyOn(authApi, 'confirmPasswordReset').mockResolvedValue(undefined)
    render(<MemoryRouter initialEntries={['/password-reset']}><PasswordResetPage /></MemoryRouter>)

    await fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'qa@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('qa@example.com'))
    expect(screen.getByRole('textbox', { name: 'Reset code' })).toBeVisible()

    fireEvent.change(screen.getByRole('textbox', { name: 'Reset code' }), { target: { value: '123456' } })
    fireEvent.change(document.querySelector<HTMLInputElement>('input[name="password"]')!, { target: { value: 'new-correct-horse-battery-staple' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledWith({
      email: 'qa@example.com', otp: '123456', password: 'new-correct-horse-battery-staple',
    }))
    expect(screen.getByRole('status')).toHaveTextContent('Password reset')
    request.mockRestore()
    confirm.mockRestore()
  })
})
