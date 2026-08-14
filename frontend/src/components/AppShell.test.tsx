import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../features/auth/AuthContext'
import type { UserSummary } from '../features/auth/api'
import { AppShell } from './AppShell'

const baseUser: UserSummary = {
  id: 'user-1', email: 'qa@example.com', displayName: 'QA User', avatarUrl: undefined,
  emailVerified: true, status: 'ACTIVE', platformRole: 'MEMBER', loginMethods: ['PASSWORD'], platformPermissions: [],
}

function renderShell(user: UserSummary | null = baseUser) {
  const context: AuthContextValue = {
    user, providers: null, loading: false, login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(),
    resendEmail: vi.fn(), resendAuthenticatedEmail: vi.fn(), logout: vi.fn().mockResolvedValue(undefined),
  }
  function LocationProbe() {
    return <output data-testid="location">{useLocation().pathname}</output>
  }
  return { ...render(<MemoryRouter initialEntries={['/']}><AuthContext.Provider value={context}><AppShell /><LocationProbe /></AuthContext.Provider></MemoryRouter>), context }
}

describe('AppShell account navigation', () => {
  it('opens an accessible account menu with permitted destinations', () => {
    renderShell({ ...baseUser, platformPermissions: ['USER_ADMINISTER'] })
    const trigger = screen.getByRole('button', { name: 'Open account menu for QA User' })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Account security' })).toHaveAttribute('href', '/account#security')
    expect(screen.getByRole('menuitem', { name: 'Active sessions' })).toHaveAttribute('href', '/account#sessions')
    expect(screen.getByRole('menuitem', { name: 'Administration' })).toHaveAttribute('href', '/admin/users')
    expect(screen.queryByRole('menuitem', { name: 'Verify email' })).not.toBeInTheDocument()
  })

  it('shows verification recovery but hides workspace destinations for an unverified user', () => {
    renderShell({ ...baseUser, emailVerified: false })
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu for QA User' }))
    expect(screen.getByRole('menuitem', { name: 'Verify email' })).toHaveAttribute('href', '/verify-email?email=qa%40example.com&recover=1')
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument()
    expect(screen.getByText(/Your email is not verified/)).toBeVisible()
  })

  it('restores focus to the trigger when Escape closes the menu', () => {
    renderShell()
    const trigger = screen.getByRole('button', { name: 'Open account menu for QA User' })
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Account security' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('signs out and navigates to login from the menu', async () => {
    const { context } = renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu for QA User' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() => expect(context.logout).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
  })

  it('traps focus and restores body scrolling in the mobile navigation drawer', async () => {
    renderShell()
    const openButton = screen.getByRole('button', { name: 'Open navigation' })
    fireEvent.click(openButton)
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Site navigation' })).toBeInTheDocument())
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Site navigation' })).not.toBeInTheDocument())
    expect(document.body.style.overflow).toBe('')
    expect(openButton).toHaveFocus()
  })
})
