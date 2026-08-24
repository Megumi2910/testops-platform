import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../features/auth/AuthContext'
import type { UserSummary } from '../features/auth/api'
import { AppShell } from './AppShell'

const baseUser: UserSummary = {
  id: 'user-1', email: 'qa@example.com', displayName: 'QA User', avatarUrl: undefined,
  emailVerified: true, status: 'ACTIVE', platformRole: 'MEMBER', loginMethods: ['PASSWORD'], platformPermissions: [],
}

function renderShell(user: UserSummary | null = baseUser, initialEntry = '/') {
  const context: AuthContextValue = {
    user, providers: null, loading: false, login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(),
    resendEmail: vi.fn(), resendAuthenticatedEmail: vi.fn(), reloadUser: vi.fn(), logout: vi.fn().mockResolvedValue(undefined),
  }
  function LocationProbe() {
    const location = useLocation()
    const navigate = useNavigate()
    return <>
      <output data-testid="location">{location.pathname}{location.hash}</output>
      <button type="button" onClick={() => navigate('/#shell-hash')}>Change shell hash</button>
    </>
  }
  return {
    ...render(<MemoryRouter initialEntries={[initialEntry]}><AuthContext.Provider value={context}><AppShell /><LocationProbe /></AuthContext.Provider></MemoryRouter>),
    context,
  }
}

function openAccountMenu(name = 'QA User') {
  const trigger = screen.getByRole('button', { name: `Open account menu for ${name}` })
  fireEvent.click(trigger)
  return trigger
}

describe('AppShell account navigation', () => {
  it('renders the guest navigation boundary', () => {
    renderShell(null)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: /Open account menu/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    expect(document.querySelector('.verification-banner')).not.toBeInTheDocument()
  })

  it('renders verified-member destinations without administrator actions', () => {
    renderShell()
    expect(screen.getByRole('link', { name: 'Projects' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    openAccountMenu()
    expect(screen.getByRole('menuitem', { name: 'Account security' })).toHaveAttribute('href', '/account#security')
    expect(screen.getByRole('menuitem', { name: 'Active sessions' })).toHaveAttribute('href', '/account#sessions')
    expect(screen.queryByRole('menuitem', { name: 'Verify email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).not.toBeInTheDocument()
  })

  it('renders administrator-only destinations from the permission, not the role label alone', () => {
    const { rerender } = renderShell({ ...baseUser, platformRole: 'ADMIN', platformPermissions: [] })
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()

    const administrator = { ...baseUser, platformRole: 'ADMIN' as const, platformPermissions: ['USER_ADMINISTER'] }
    const context: AuthContextValue = {
      user: administrator, providers: null, loading: false, login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(),
      resendEmail: vi.fn(), resendAuthenticatedEmail: vi.fn(), reloadUser: vi.fn(), logout: vi.fn().mockResolvedValue(undefined),
    }
    rerender(<MemoryRouter><AuthContext.Provider value={context}><AppShell /></AuthContext.Provider></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin/users')
    openAccountMenu()
    expect(screen.getByRole('menuitem', { name: 'Administration' })).toHaveAttribute('href', '/admin/users')
  })

  it('shows verification recovery but hides workspace destinations for an unverified user', () => {
    renderShell({ ...baseUser, emailVerified: false })
    openAccountMenu()
    expect(screen.getByRole('menuitem', { name: 'Verify email' })).toHaveAttribute('href', '/verify-email?email=qa%40example.com&recover=1')
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(document.querySelector('.verification-banner')).toHaveTextContent('Your email is not verified')
  })

  it('keeps a long display name intact inside the ellipsis target', () => {
    const displayName = 'A deliberately long account display name used to prove safe shell truncation'
    renderShell({ ...baseUser, displayName })
    const trigger = screen.getByRole('button', { name: `Open account menu for ${displayName}` })
    expect(trigger).toHaveAttribute('type', 'button')
    expect(trigger.querySelector('.nav-account-name')).toHaveTextContent(displayName)
  })

  it('supports Arrow, Home, End, and bidirectional Tab movement inside the account menu', async () => {
    renderShell()
    const trigger = screen.getByRole('button', { name: 'Open account menu for QA User' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const first = await screen.findByRole('menuitem', { name: 'Account security' })
    const last = screen.getByRole('menuitem', { name: 'Sign out' })
    await waitFor(() => expect(first).toHaveFocus())

    fireEvent.keyDown(document, { key: 'End' })
    expect(last).toHaveFocus()
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(last).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Home' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()
  })

  it('opens with ArrowUp and restores trigger focus when Escape closes the menu', async () => {
    renderShell()
    const trigger = screen.getByRole('button', { name: 'Open account menu for QA User' })
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('dismisses the menu on outside pointer-down and shell hash changes', () => {
    renderShell()
    openAccountMenu()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    openAccountMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Change shell hash' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/#shell-hash')
  })

  it('closes the account menu and shell navigation when a destination is selected', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    openAccountMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Account security' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Site navigation' })).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/account#security')
  })

  it('closes a nested account menu on the first Escape and the drawer on the second', async () => {
    renderShell()
    const openButton = screen.getByRole('button', { name: 'Open navigation' })
    fireEvent.click(openButton)
    openAccountMenu()
    expect(screen.getByRole('menu')).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Site navigation' })).toBeVisible()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Site navigation' })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Site navigation' })).not.toBeInTheDocument())
    expect(openButton).toHaveFocus()
  })

  it('wraps drawer focus in both directions and restores body scrolling', async () => {
    renderShell()
    const openButton = screen.getByRole('button', { name: 'Open navigation' })
    fireEvent.click(openButton)
    const drawer = await screen.findByRole('dialog', { name: 'Site navigation' })
    const first = screen.getByRole('link', { name: 'Readiness' })
    const last = within(drawer).getByRole('button', { name: 'Close navigation' })
    expect(document.body.style.overflow).toBe('hidden')
    expect(drawer).toContainElement(first)

    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()
    fireEvent.click(last)
    expect(document.body.style.overflow).toBe('')
    expect(openButton).toHaveFocus()
  })

  it('dismisses the drawer from its backdrop', () => {
    renderShell()
    const openButton = screen.getByRole('button', { name: 'Open navigation' })
    fireEvent.click(openButton)
    const backdrop = document.querySelector<HTMLButtonElement>('.nav-drawer-backdrop')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop!)
    expect(screen.queryByRole('dialog', { name: 'Site navigation' })).not.toBeInTheDocument()
    expect(openButton).toHaveFocus()
  })

  it('signs out and navigates to login from the menu', async () => {
    const { context } = renderShell()
    openAccountMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() => expect(context.logout).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
  })
})
