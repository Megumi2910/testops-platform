import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from './AuthContext'
import { AccountPage } from './AccountPages'
import { authApi, type UserSummary } from './api'

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
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith({ currentPassword: 'old-password', newPassword: 'new-correct-horse-battery-staple' }))
    expect(context.logout).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login?reason=password-changed'))
  })

  it('guides a Google-only account through password setup and refreshes identity', async () => {
    vi.spyOn(authApi, 'sessions').mockResolvedValue([])
    const challenge = vi.spyOn(authApi, 'passwordChallenge').mockResolvedValue({ message: 'Check your email for a verification code' })
    const confirm = vi.spyOn(authApi, 'passwordConfirm').mockResolvedValue(undefined)
    const updatedUser = { ...baseUser, loginMethods: ['GOOGLE', 'PASSWORD'] }
    const reloadUser = vi.fn().mockResolvedValue(updatedUser)
    renderAccount({ ...baseUser, loginMethods: ['GOOGLE'] }, { reloadUser })

    fireEvent.click(screen.getByRole('button', { name: 'Send setup code' }))
    await waitFor(() => expect(challenge).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-correct-horse-battery-staple' } })
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
})
