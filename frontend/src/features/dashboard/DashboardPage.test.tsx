import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { dashboardApi } from './api'
import { DashboardPage } from './DashboardPage'
import { dashboardWindow } from './dashboardWindow'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function renderDashboard(initialEntry = '/dashboard?range=7') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function LocationProbe() {
    return <output data-testid="location"><>{useLocation().search}</></output>
  }
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}><LocationProbe /><DashboardPage /></MemoryRouter></QueryClientProvider>)
}

describe('dashboardWindow', () => {
  it('accepts a bounded explicit UTC window', () => {
    const window = dashboardWindow(new URLSearchParams('from=2026-08-01T00:00:00Z&to=2026-08-03T00:00:00Z'))
    expect(window.selection).toBe('custom')
    expect(window.from).toBe('2026-08-01T00:00:00.000Z')
    expect(window.to).toBe('2026-08-03T00:00:00.000Z')
  })

  it('falls back to a safe 30-day window for invalid ranges', () => {
    const now = new Date('2026-08-12T12:00:00Z')
    const window = dashboardWindow(new URLSearchParams('range=999&from=bad'), now)
    expect(window.selection).toBe('30')
    expect(window.from).toBe('2026-07-13T12:00:00.000Z')
    expect(window.to).toBe('2026-08-12T12:00:00.000Z')
  })
})

describe('DashboardPage', () => {
  it('fetches the three dashboard panels for the selected URL range and updates it accessibly', async () => {
    vi.setSystemTime(new Date('2026-08-12T12:00:00Z'))
    const summary = vi.spyOn(dashboardApi, 'summary').mockResolvedValue({ totalExecutions: 2, passedCases: 1, failedCases: 1, infrastructureErrors: 0, functionalPassRate: .5, infrastructureErrorRate: 0, from: '', to: '' })
    const recent = vi.spyOn(dashboardApi, 'recent').mockResolvedValue([])
    const infrastructure = vi.spyOn(dashboardApi, 'infrastructure').mockResolvedValue([])
    renderDashboard()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Execution dashboard' })).toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: 'Reporting period' })).toHaveValue('7')
    expect(summary).toHaveBeenCalledWith('2026-08-05T12:00:00.000Z', '2026-08-12T12:00:00.000Z')
    expect(recent).toHaveBeenCalledWith('2026-08-05T12:00:00.000Z', '2026-08-12T12:00:00.000Z')
    expect(infrastructure).toHaveBeenCalledWith('2026-08-05T12:00:00.000Z', '2026-08-12T12:00:00.000Z')

    fireEvent.change(screen.getByRole('combobox', { name: 'Reporting period' }), { target: { value: '90' } })
    expect(screen.getByTestId('location')).toHaveTextContent('range=90')
    await waitFor(() => expect(summary).toHaveBeenCalledWith('2026-05-14T12:00:00.000Z', '2026-08-12T12:00:00.000Z'))
  })

  it('keeps panel failures independent and retries only the selected panel', async () => {
    const summary = vi.spyOn(dashboardApi, 'summary')
      .mockRejectedValueOnce(new Error('summary unavailable'))
      .mockResolvedValueOnce({ totalExecutions: 1, passedCases: 1, failedCases: 0, infrastructureErrors: 0, functionalPassRate: 1, infrastructureErrorRate: 0, from: '', to: '' })
    const recent = vi.spyOn(dashboardApi, 'recent')
      .mockRejectedValueOnce(new Error('recent unavailable'))
      .mockResolvedValueOnce([])
    const infrastructure = vi.spyOn(dashboardApi, 'infrastructure')
      .mockRejectedValueOnce(new Error('infrastructure unavailable'))
      .mockResolvedValueOnce([])
    renderDashboard()

    expect(await screen.findByRole('button', { name: 'Retry pass-rate reporting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry recent failures' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry infrastructure categories' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry recent failures' }))
    await waitFor(() => expect(recent).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('heading', { name: 'Recent failures' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry recent failures' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry pass-rate reporting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry infrastructure categories' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry pass-rate reporting' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry infrastructure categories' }))
    await waitFor(() => {
      expect(summary).toHaveBeenCalledTimes(2)
      expect(infrastructure).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('No infrastructure errors')).toBeInTheDocument()
  })
})
