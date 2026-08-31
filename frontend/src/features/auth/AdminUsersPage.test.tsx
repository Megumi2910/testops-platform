import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AdminUsersPage } from './AccountPages'

const user = { id: 'user-1', email: 'qa@example.com', displayName: 'QA User', status: 'ACTIVE', platformRole: 'MEMBER', emailVerified: true, createdAt: '2026-08-14T00:00:00Z' }

function json(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }))
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter><AdminUsersPage /></MemoryRouter></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('AdminUsersPage', () => {
  it('keeps pagination in the request and exposes a current page', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => json({ content: [user], page: 0, size: 25, totalElements: 26, totalPages: 2 }))
      .mockImplementationOnce(() => json({ content: [{ ...user, id: 'user-2', email: 'second@example.com', displayName: 'Second User' }], page: 1, size: 25, totalElements: 26, totalPages: 2 }))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    expect(await screen.findByText('QA User')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search users' })).toHaveAttribute('name', 'adminUserSearch')
    expect(screen.getByText('Page 1 of 2 · 26 users')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(screen.getByText('Second User')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('/api/v1/admin/users?page=1&size=25'), expect.anything())
    expect(screen.getByText('Page 2 of 2 · 26 users')).toBeInTheDocument()
  })

  it('offers a retry when the user list fails to load', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => json({ content: [user], page: 0, size: 25, totalElements: 1, totalPages: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load users.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('QA User')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('explains the final-active-administrator protection', async () => {
    const admin = { ...user, platformRole: 'ADMIN' }
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => json({ content: [admin], page: 0, totalElements: 1, totalPages: 1 }))
      .mockImplementationOnce(() => json({ code: 'final_active_admin', detail: 'The final active administrator cannot be demoted' }, 409))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    const roleSelect = await screen.findByRole('combobox', { name: 'Platform role for qa@example.com' })
    fireEvent.change(roleSelect, { target: { value: 'MEMBER' } })

    const dialog = await screen.findByRole('dialog', { name: 'Demote QA User?' })
    expect(within(dialog).getByText(/QA User \(qa@example\.com\) will lose platform administrator access/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Demote to member' }))

    const row = screen.getByText('QA User').closest('li')
    expect(row).not.toBeNull()
    const alert = await within(row!).findByRole('alert')
    expect(alert).toHaveTextContent('The final active administrator cannot be demoted or disabled.')
    expect(roleSelect).toHaveAttribute('aria-describedby', alert.id)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['LOCKED', 'Lock QA User?', 'Lock account'],
    ['DISABLED', 'Disable QA User?', 'Disable account'],
  ])('confirms before changing an account status to %s', async (status, title, confirmLabel) => {
    const updatedUser = { ...user, status }
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => json({ content: [user], page: 0, totalElements: 1, totalPages: 1 }))
      .mockImplementationOnce(() => json(updatedUser))
      .mockImplementationOnce(() => json({ content: [updatedUser], page: 0, totalElements: 1, totalPages: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    fireEvent.change(await screen.findByRole('combobox', { name: 'Account status for qa@example.com' }), { target: { value: status } })

    const dialog = await screen.findByRole('dialog', { name: title })
    expect(within(dialog).getByText(/QA User \(qa@example\.com\) will be unable to sign in/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(within(dialog).getByRole('button', { name: confirmLabel }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/admin/users/user-1/status')
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status }) }))
    const row = screen.getByText('QA User').closest('li')
    expect(row).not.toBeNull()
    const statusMessage = within(row!).getByRole('status')
    expect(statusMessage).toHaveTextContent(`QA User's account is now ${status.toLowerCase()}.`)
  })

  it('keeps successful mutation feedback with the affected user row', async () => {
    const secondUser = { ...user, id: 'user-2', email: 'second@example.com', displayName: 'Second User' }
    const promotedUser = { ...user, platformRole: 'ADMIN' }
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => json({ content: [user, secondUser], page: 0, totalElements: 2, totalPages: 1 }))
      .mockImplementationOnce(() => json(promotedUser))
      .mockImplementationOnce(() => json({ content: [promotedUser, secondUser], page: 0, totalElements: 2, totalPages: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    const roleSelect = await screen.findByRole('combobox', { name: 'Platform role for qa@example.com' })
    fireEvent.change(roleSelect, { target: { value: 'ADMIN' } })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const affectedRow = screen.getByText('QA User').closest('li')
    const unaffectedRow = screen.getByText('Second User').closest('li')
    expect(affectedRow).not.toBeNull()
    expect(unaffectedRow).not.toBeNull()
    const statusMessage = within(affectedRow!).getByRole('status')
    expect(statusMessage).toHaveTextContent('QA User is now a platform administrator.')
    expect(roleSelect).toHaveAttribute('aria-describedby', statusMessage.id)
    expect(within(unaffectedRow!).queryByRole('status')).not.toBeInTheDocument()
  })

  it('tracks concurrent rows independently and lets another row confirmation close', async () => {
    const secondUser = { ...user, id: 'user-2', email: 'second@example.com', displayName: 'Second User' }
    const promotedUser = { ...user, platformRole: 'ADMIN' }
    const promotedSecond = { ...secondUser, platformRole: 'ADMIN' }
    let firstResolved = false
    let secondResolved = false
    let resolveFirst!: (response: Response) => void
    let resolveSecond!: (response: Response) => void
    const firstMutation = new Promise<Response>(resolve => { resolveFirst = resolve })
    const secondMutation = new Promise<Response>(resolve => { resolveSecond = resolve })
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/api/v1/admin/users?')) {
        return json({
          content: [firstResolved ? promotedUser : user, secondResolved ? promotedSecond : secondUser],
          page: 0,
          totalElements: 2,
          totalPages: 1,
        })
      }
      if (url.endsWith('/user-1/platform-role')) return firstMutation
      if (url.endsWith('/user-2/platform-role')) return secondMutation
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    const firstRole = await screen.findByRole('combobox', { name: 'Platform role for qa@example.com' })
    const secondRole = screen.getByRole('combobox', { name: 'Platform role for second@example.com' })
    fireEvent.change(firstRole, { target: { value: 'ADMIN' } })
    expect(firstRole).toBeDisabled()
    expect(secondRole).not.toBeDisabled()

    fireEvent.change(screen.getByRole('combobox', { name: 'Account status for second@example.com' }), { target: { value: 'LOCKED' } })
    const dialog = await screen.findByRole('dialog', { name: 'Lock Second User?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Lock Second User?' })).not.toBeInTheDocument()
    expect(firstRole).toBeDisabled()

    fireEvent.change(secondRole, { target: { value: 'ADMIN' } })
    expect(secondRole).toBeDisabled()
    secondResolved = true
    resolveSecond(new Response(JSON.stringify(promotedSecond), { headers: { 'Content-Type': 'application/json' } }))

    const secondRow = screen.getByText('Second User').closest('li')
    expect(secondRow).not.toBeNull()
    expect(await within(secondRow!).findByRole('status')).toHaveTextContent('Second User is now a platform administrator.')
    expect(firstRole).toBeDisabled()

    firstResolved = true
    resolveFirst(new Response(JSON.stringify(promotedUser), { headers: { 'Content-Type': 'application/json' } }))

    const firstRow = screen.getByText('QA User').closest('li')
    expect(firstRow).not.toBeNull()
    expect(await within(firstRow!).findByRole('status')).toHaveTextContent('QA User is now a platform administrator.')
    expect(within(secondRow!).getByRole('status')).toHaveTextContent('Second User is now a platform administrator.')
  })
})
