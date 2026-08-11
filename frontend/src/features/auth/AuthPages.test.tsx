import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from './AuthContext'
import { VerifyEmailPage } from './AuthPages'

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
