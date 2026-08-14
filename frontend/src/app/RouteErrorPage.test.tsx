import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { RouteErrorPage } from './RouteErrorPage'

function BrokenRoute(): ReactNode {
  throw new Error('Failed to fetch dynamically imported module')
}

describe('RouteErrorPage', () => {
  it('turns a lazy chunk failure into a recoverable branded page', async () => {
    const router = createMemoryRouter([{ path: '/', element: <BrokenRoute />, errorElement: <RouteErrorPage /> }])
    render(<RouterProvider router={router} />)
    expect(await screen.findByRole('heading', { name: 'We couldn’t load this page' })).toBeVisible()
    expect(screen.getByText(/older application bundle/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reload application' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Return to readiness' })).toHaveAttribute('href', '/')
  })
})
