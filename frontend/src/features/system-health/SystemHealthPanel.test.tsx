import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SystemHealthPanel } from './SystemHealthPanel'

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SystemHealthPanel />
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('SystemHealthPanel', () => {
  it('shows healthy state from Actuator', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'UP' }) }))
    renderPanel()
    expect(await screen.findByRole('heading', { name: 'Backend ready' })).toBeInTheDocument()
  })

  it('shows unavailable state when the backend request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderPanel()
    expect(await screen.findByRole('heading', { name: 'Backend unavailable' })).toBeInTheDocument()
  })
})
