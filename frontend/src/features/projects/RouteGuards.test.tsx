import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../auth/AuthContext'
import { PlatformPermissionRoute } from './RouteGuards'

const baseAuth: AuthContextValue = {
  user: {
    id: 'user-1',
    email: 'member@example.test',
    displayName: 'Member',
    emailVerified: true,
    status: 'ACTIVE',
    platformRole: 'MEMBER',
    loginMethods: ['PASSWORD'],
    platformPermissions: [],
  },
  providers: { enabled: true, registrationEnabled: true, emailVerificationEnabled: true, googleEnabled: false },
  loading: false,
  login: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  resendEmail: vi.fn(),
  resendAuthenticatedEmail: vi.fn(),
  logout: vi.fn(),
}

function renderGuard(auth: AuthContextValue) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route element={<PlatformPermissionRoute permission="USER_ADMINISTER" />}>
            <Route path="/admin/users" element={<p>Administration</p>} />
          </Route>
          <Route path="/dashboard" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('PlatformPermissionRoute', () => {
  it('redirects a verified member without the required permission', () => {
    renderGuard(baseAuth)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Administration')).not.toBeInTheDocument()
  })

  it('renders the protected route for an authorized administrator', () => {
    renderGuard({ ...baseAuth, user: { ...baseAuth.user!, platformRole: 'ADMIN', platformPermissions: ['USER_ADMINISTER'] } })
    expect(screen.getByText('Administration')).toBeInTheDocument()
  })
})
