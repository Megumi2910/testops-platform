import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button, ConfirmDialog, EmptyState, StatusBadge } from './ui'

describe('shared UI primitives', () => {
  it('renders explicit button variants and busy state', () => {
    render(<Button variant="secondary" busy>Save changes</Button>)
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()
    expect(screen.getByRole('button')).toHaveClass('button-secondary')
  })

  it('exposes status semantics and actionable empty states', () => {
    render(<><StatusBadge status="success">Reachable</StatusBadge><EmptyState title="No runs yet" description="Create a READY case first." action={<button type="button">Open suites</button>} /></>)
    expect(screen.getByText('Reachable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No runs yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open suites' })).toBeInTheDocument()
  })

  it('closes a confirmation dialog from the cancel action', () => {
    function Fixture() {
      return <ConfirmDialog open title="Archive project?" description="This cannot start new runs." onConfirm={() => undefined} onClose={() => { const dialog = document.querySelector('[role="dialog"]'); dialog?.remove() }} />
    }
    render(<Fixture />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
