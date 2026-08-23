import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
      const [open, setOpen] = useState(true)
      return <ConfirmDialog open={open} title="Archive project?" description="This cannot start new runs." onConfirm={() => undefined} onClose={() => setOpen(false)} />
    }
    render(<Fixture />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('uses a semantic backdrop action without including it in the modal focus loop', () => {
    const onClose = vi.fn()
    render(<ConfirmDialog open title="Archive project?" description="This cannot start new runs." onConfirm={() => undefined} onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Archive project?' })
    const dismiss = screen.getByRole('button', { name: 'Dismiss dialog' })
    const close = screen.getByRole('button', { name: 'Close dialog' })
    expect(dismiss).toHaveAttribute('tabindex', '-1')
    expect(close).toHaveFocus()

    fireEvent.click(screen.getByText('This cannot start new runs.'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(dismiss)
    expect(onClose).toHaveBeenCalledOnce()
    expect(dialog).toBeInTheDocument()
  })

  it('disables backdrop and keyboard dismissal while confirmation is busy', () => {
    const onClose = vi.fn()
    render(<ConfirmDialog open busy title="Archive project?" description="This cannot start new runs." onConfirm={() => undefined} onClose={onClose} />)

    const dismiss = screen.getByRole('button', { name: 'Dismiss dialog' })
    expect(dismiss).toBeDisabled()
    fireEvent.click(dismiss)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps focus trapped while a confirmation becomes busy and restores the original trigger', () => {
    function Fixture() {
      const [open, setOpen] = useState(false)
      const [busy, setBusy] = useState(false)
      return <>
        <button type="button" onClick={() => setOpen(true)}>Open archive dialog</button>
        <button type="button" onClick={() => setBusy(false)}>Finish request</button>
        <ConfirmDialog open={open} busy={busy} title="Archive project?" description="This cannot start new runs." onConfirm={() => setBusy(true)} onClose={() => setOpen(false)} />
      </>
    }

    render(<Fixture />)
    const trigger = screen.getByRole('button', { name: 'Open archive dialog' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    const dialog = screen.getByRole('dialog', { name: 'Archive project?' })
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Finish request' }))
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(trigger).toHaveFocus()
  })

  it('keeps keyboard focus inside confirmation dialogs', () => {
    render(<ConfirmDialog open title="Restore suite?" description="Restore this suite." confirmLabel="Restore" onConfirm={() => undefined} onClose={() => undefined}><label>Restore name<input /></label></ConfirmDialog>)
    const close = screen.getByRole('button', { name: 'Close dialog' })
    const restore = screen.getByRole('button', { name: 'Restore' })
    expect(close).toHaveFocus()
    restore.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()
    close.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(restore).toHaveFocus()
  })
})
