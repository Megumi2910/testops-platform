import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

    fireEvent.change(await screen.findByRole('combobox', { name: 'Platform role for qa@example.com' }), { target: { value: 'MEMBER' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('The final active administrator cannot be demoted or disabled.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
