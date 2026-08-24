import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from './AuthContext'
import { LoginPage, OAuthCallbackPage, PasswordResetPage, RegisterPage, VerifyEmailPage } from './AuthPages'
import { authApi } from './api'
import { ApiError } from '../../lib/api'

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
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByTestId('retained-swap-revision-b')).toHaveTextContent('Deployment recovery ready · build')
  })

  it('keeps provider errors generic on the callback page', async () => {
    const context: AuthContextValue = {
      user: null, providers: null, loading: false, login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(),
      resendEmail: vi.fn(), resendAuthenticatedEmail: vi.fn(), reloadUser: vi.fn(), logout: vi.fn(),
    }
    render(<MemoryRouter initialEntries={['/auth/oauth/callback?oauth_error=oauth_sign_in_failed']}><AuthContext.Provider value={context}><OAuthCallbackPage /></AuthContext.Provider></MemoryRouter>)
    expect(await screen.findByText('Google sign-in could not be completed.', { exact: true })).toBeVisible()
    expect(screen.queryByText(/client_secret|token|stack|exception/i)).not.toBeInTheDocument()
  })
})

describe('Password constraints', () => {
  it('keeps registration passwords within the server-supported range', () => {
    const context: AuthContextValue = {
      user: null,
      providers: { enabled: true, registrationEnabled: true, emailVerificationEnabled: true, googleEnabled: false },
      loading: false,
      login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendEmail: vi.fn(),
      resendAuthenticatedEmail: vi.fn(), reloadUser: vi.fn(), logout: vi.fn(),
    }
    render(<MemoryRouter><AuthContext.Provider value={context}><RegisterPage /></AuthContext.Provider></MemoryRouter>)

    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '12')
    expect(screen.getByLabelText('Password')).toHaveAttribute('maxlength', '128')
  })
})

describe('PasswordResetPage', () => {
  it('associates server reset-code errors with the invalid field', async () => {
    vi.spyOn(authApi, 'requestPasswordReset').mockResolvedValue({
      message: 'If the account can be recovered, a reset code has been sent',
      nextResendAt: '2026-08-12T12:00:30Z',
      retryAfterSeconds: 0,
    })
    vi.spyOn(authApi, 'confirmPasswordReset').mockRejectedValue(new ApiError(400, 'The reset code is invalid.', { errors: { otp: 'Enter the six-digit code from your email.' } }))
    render(
      <MemoryRouter initialEntries={['/password-reset']}>
        <Routes>
          <Route path="/password-reset" element={<PasswordResetPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'qa@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }))
    await screen.findByRole('textbox', { name: 'Reset code' })
    expect(screen.getByLabelText('New password')).toHaveAttribute('minlength', '12')
    expect(screen.getByLabelText('New password')).toHaveAttribute('maxlength', '128')
    fireEvent.change(screen.getByRole('textbox', { name: 'Reset code' }), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-correct-horse-battery-staple' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    const otp = await screen.findByRole('textbox', { name: 'Reset code' })
    await waitFor(() => expect(otp).toHaveAttribute('aria-invalid', 'true'))
    expect(otp).toHaveAttribute('aria-describedby', 'reset-otp-error')
    expect(screen.getByText('Enter the six-digit code from your email.')).toBeVisible()
  })

  it('preserves the reset email when returning to sign in', async () => {
    const context: AuthContextValue = {
      user: null,
      providers: { enabled: true, registrationEnabled: true, emailVerificationEnabled: true, googleEnabled: false },
      loading: false,
      login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendEmail: vi.fn(),
      resendAuthenticatedEmail: vi.fn(), reloadUser: vi.fn(), logout: vi.fn(),
    }
    render(
      <MemoryRouter initialEntries={['/password-reset']}>
        <AuthContext.Provider value={context}>
          <Routes>
            <Route path="/password-reset" element={<PasswordResetPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    await fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'qa@example.com' } })
    fireEvent.click(screen.getByRole('link', { name: 'Back to sign in' }))

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('qa@example.com')
  })

  it('moves from a generic reset request to the code form and confirms the new password', async () => {
    const request = vi.spyOn(authApi, 'requestPasswordReset').mockResolvedValue({
      message: 'If the account can be recovered, a reset code has been sent',
      nextResendAt: '2026-08-12T12:00:30Z',
      retryAfterSeconds: 30,
    })
    const confirm = vi.spyOn(authApi, 'confirmPasswordReset').mockResolvedValue(undefined)
    const context: AuthContextValue = {
      user: null,
      providers: { enabled: true, registrationEnabled: true, emailVerificationEnabled: true, googleEnabled: false },
      loading: false,
      login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendEmail: vi.fn(),
      resendAuthenticatedEmail: vi.fn(), reloadUser: vi.fn(), logout: vi.fn(),
    }
    render(
      <MemoryRouter initialEntries={['/password-reset']}>
        <AuthContext.Provider value={context}>
          <Routes>
            <Route path="/password-reset" element={<PasswordResetPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

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
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible())
    expect(screen.getByRole('status')).toHaveTextContent('Your password was updated')
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('qa@example.com')
    request.mockRestore()
    confirm.mockRestore()
  })

  it.each([
    ['password-changed', 'Sign in again with your new password.'],
    ['google-unlinked', 'Google was removed and all other sessions were signed out.'],
    ['sessions-revoked', 'All refresh sessions were revoked. Sign in again to continue.'],
  ])('shows the %s recovery notice on sign in', (reason, message) => {
    const context: AuthContextValue = {
      user: null,
      providers: { enabled: true, registrationEnabled: true, emailVerificationEnabled: true, googleEnabled: false },
      loading: false,
      login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendEmail: vi.fn(),
      resendAuthenticatedEmail: vi.fn(), reloadUser: vi.fn(), logout: vi.fn(),
    }
    render(<MemoryRouter initialEntries={[`/login?reason=${reason}`]}><AuthContext.Provider value={context}><LoginPage /></AuthContext.Provider></MemoryRouter>)
    expect(screen.getByRole('status')).toHaveTextContent(message)
  })
})
