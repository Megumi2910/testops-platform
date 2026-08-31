import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from './AuthContext'
import { AccountPage } from './AccountPages'
import { authApi, type UserSummary } from './api'
import { ApiError } from '../../lib/api'

const baseUser: UserSummary = {
  id: 'user-1', email: 'qa@example.com', displayName: 'QA User', emailVerified: true,
  status: 'ACTIVE', platformRole: 'MEMBER', loginMethods: ['PASSWORD'], platformPermissions: [],
}

function renderAccount(user: UserSummary = baseUser, overrides: Partial<AuthContextValue> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const context: AuthContextValue = {
    user, providers: null, loading: false, login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(),
    resendEmail: vi.fn(), resendAuthenticatedEmail: vi.fn(), reloadUser: vi.fn().mockResolvedValue(user),
    logout: vi.fn().mockResolvedValue(undefined), ...overrides,
  }
  function LocationProbe() { return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output> }
  return { context, ...render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/account#security']}><AuthContext.Provider value={context}><AccountPage /><LocationProbe /></AuthContext.Provider></MemoryRouter></QueryClientProvider>) }
}

afterEach(() => { vi.restoreAllMocks() })

describe('AccountPage', () => {
  it('changes the password and signs the current browser out', async () => {
    vi.spyOn(authApi, 'sessions').mockResolvedValue([])
    const changePassword = vi.spyOn(authApi, 'changePassword').mockResolvedValue(undefined)
    const { context } = renderAccount()

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-correct-horse-battery-staple' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-correct-horse-battery-staple' } })
    expect(screen.getByLabelText('New password')).toHaveAttribute('maxlength', '128')
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('maxlength', '128')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith({ currentPassword: 'old-password', newPassword: 'new-correct-horse-battery-staple' }))
    expect(context.logout).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login?reason=password-changed'))
  })

  it('uses the server deadline for password setup cooldown and refreshes identity', async () => {
    let now = Date.parse('2026-08-23T12:00:00Z')
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    vi.spyOn(authApi, 'sessions').mockResolvedValue([])
    const challenge = vi.spyOn(authApi, 'passwordChallenge').mockResolvedValue({
      message: 'Check your email for a verification code',
      nextResendAt: '2026-08-23T12:00:05Z',
      retryAfterSeconds: 30,
    })
    const confirm = vi.spyOn(authApi, 'passwordConfirm').mockResolvedValue(undefined)
    const updatedUser = { ...baseUser, loginMethods: ['GOOGLE', 'PASSWORD'] }
    const reloadUser = vi.fn().mockResolvedValue(updatedUser)
    renderAccount({ ...baseUser, loginMethods: ['GOOGLE'] }, { reloadUser })

    fireEvent.click(screen.getByRole('button', { name: 'Send setup code' }))
    await waitFor(() => expect(challenge).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Send another code in 5s' })).toBeDisabled()
    now += 6_000
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send another code' })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-correct-horse-battery-staple' } })
    expect(screen.getByLabelText('New password')).toHaveAttribute('maxlength', '128')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm password' }))

    await waitFor(() => expect(confirm).toHaveBeenCalledWith({ otp: '123456', password: 'new-correct-horse-battery-staple' }))
    expect(reloadUser).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Password login added to your account.')).toBeVisible()
  })

  it('requires confirmation before unlinking Google and then signs out', async () => {
    vi.spyOn(authApi, 'sessions').mockResolvedValue([])
    const unlink = vi.spyOn(authApi, 'unlinkGoogle').mockResolvedValue(undefined)
    const { context } = renderAccount({ ...baseUser, loginMethods: ['PASSWORD', 'GOOGLE'] })

    fireEvent.click(screen.getByRole('button', { name: 'Unlink Google' }))
    const dialog = screen.getByRole('dialog', { name: 'Unlink Google?' })
    expect(dialog).toBeVisible()
    fireEvent.change(within(dialog).getByLabelText('Current password'), { target: { value: 'old-password' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unlink Google' }))

    await waitFor(() => expect(unlink).toHaveBeenCalledWith('old-password'))
    expect(context.logout).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login?reason=google-unlinked'))
  })

  it('keeps an empty Google unlink attempt in the dialog and does not call the API', async () => {
    vi.spyOn(authApi, 'sessions').mockResolvedValue([])
    const unlink = vi.spyOn(authApi, 'unlinkGoogle').mockResolvedValue(undefined)
    renderAccount({ ...baseUser, loginMethods: ['PASSWORD', 'GOOGLE'] })

    fireEvent.click(screen.getByRole('button', { name: 'Unlink Google' }))
    const dialog = screen.getByRole('dialog', { name: 'Unlink Google?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unlink Google' }))

    expect(unlink).not.toHaveBeenCalled()
    expect(dialog).toBeVisible()
    const password = within(dialog).getByLabelText('Current password')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-describedby', 'unlink-password-error')
    expect(within(dialog).getByText('Enter your current password to unlink Google.')).toBeVisible()
  })

  it('associates password-change validation errors with the confirmation control', async () => {
    vi.spyOn(authApi, 'sessions').mockResolvedValue([])
    const changePassword = vi.spyOn(authApi, 'changePassword').mockResolvedValue(undefined)
    renderAccount()

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-correct-horse-battery-staple' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different-correct-horse-battery-staple' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(changePassword).not.toHaveBeenCalled()
    const confirmation = screen.getByLabelText('Confirm new password')
    expect(confirmation).toHaveAttribute('aria-invalid', 'true')
    expect(confirmation).toHaveAttribute('aria-describedby', 'password-confirmation-error')
    expect(screen.getByText('New password and confirmation must match.')).toBeVisible()
  })

  it('associates password-setup server errors with the invalid control', async () => {
    vi.spyOn(authApi, 'sessions').mockResolvedValue([])
    vi.spyOn(authApi, 'passwordChallenge').mockResolvedValue({
      message: 'Check your email for a verification code',
      nextResendAt: '2026-08-23T12:00:30Z',
      retryAfterSeconds: 30,
    })
    const confirm = vi.spyOn(authApi, 'passwordConfirm').mockRejectedValue(new ApiError(400, 'The verification code is invalid.', { errors: { otp: 'Enter the six-digit code from your email.' } }))
    renderAccount({ ...baseUser, loginMethods: ['GOOGLE'] })

    fireEvent.click(screen.getByRole('button', { name: 'Send setup code' }))
    await screen.findByLabelText('Verification code')
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-correct-horse-battery-staple' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm password' }))

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    const otp = screen.getByLabelText('Verification code')
    expect(otp).toHaveAttribute('aria-invalid', 'true')
    expect(otp).toHaveAttribute('aria-describedby', 'setup-otp-error')
    expect(screen.getByText('Enter the six-digit code from your email.')).toBeVisible()
  })

  it.each([
    [true, true],
    [false, false],
  ])('shows Link Google only when the provider is enabled (%s)', (googleEnabled, visible) => {
    vi.spyOn(authApi, 'sessions').mockResolvedValue([])
    renderAccount(baseUser, { providers: { enabled: true, registrationEnabled: true, emailVerificationEnabled: true, googleEnabled } })

    expect(Boolean(screen.queryByRole('button', { name: 'Link Google' }))).toBe(visible)
  })

  it('retains Google unlink when an already-linked provider is disabled', () => {
    vi.spyOn(authApi, 'sessions').mockResolvedValue([])
    renderAccount(
      { ...baseUser, loginMethods: ['PASSWORD', 'GOOGLE'] },
      { providers: { enabled: true, registrationEnabled: true, emailVerificationEnabled: true, googleEnabled: false } },
    )

    expect(screen.getByRole('button', { name: 'Unlink Google' })).toBeVisible()
  })

  it('shows session context without failing when the client IP is unavailable', async () => {
    vi.spyOn(authApi, 'sessions').mockResolvedValue([
      { familyId: 'family-1', userAgent: 'Chrome on Windows', issuedAt: '2026-08-15T08:00:00Z', expiresAt: '2026-08-22T08:00:00Z', createdIp: '192.0.2.10' },
      { familyId: 'family-2', userAgent: '', issuedAt: '2026-08-15T09:00:00Z', expiresAt: '2026-08-22T09:00:00Z' },
    ])
    renderAccount()

    const sessionRows = await screen.findAllByRole('listitem')
    expect(sessionRows).toHaveLength(2)
    expect(sessionRows[0]).toHaveTextContent('Chrome on Windows')
    expect(sessionRows[0]).toHaveTextContent('IP 192.0.2.10')
    expect(sessionRows[1]).toHaveTextContent('Unknown browser')
    expect(sessionRows[1]).toHaveTextContent('IP Unavailable')
  })
})
