import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../lib/api'
import { RestoreDefinitionDialog } from './DefinitionLifecycle'

describe('definition restore dialog', () => {
  it('explains a name conflict and submits the replacement name', () => {
    const onRestore = vi.fn()
    render(<RestoreDefinitionDialog
      open
      kind="case"
      currentName="Checkout smoke"
      busy={false}
      error={new ApiError(409, 'An active case already uses this name', { code: 'case_restore_name_conflict' })}
      onClose={() => undefined}
      onRestore={onRestore}
    />)

    expect(screen.getByText('That name is already active.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Restore name' }), { target: { value: 'Checkout smoke restored' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restore case' }))
    expect(onRestore).toHaveBeenCalledWith('Checkout smoke restored')
  })

  it('does not send an unnecessary rename when the original name is unchanged', () => {
    const onRestore = vi.fn()
    render(<RestoreDefinitionDialog open kind="suite" currentName="Smoke" busy={false} error={null} onClose={() => undefined} onRestore={onRestore} />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore suite' }))
    expect(onRestore).toHaveBeenCalledWith(undefined)
  })

  it('shows a correlation reference and offers an explicit retry for recoverable restore failures', () => {
    const onRestore = vi.fn()
    render(<RestoreDefinitionDialog
      open
      kind="suite"
      currentName="Smoke"
      busy={false}
      error={new ApiError(503, 'Restore unavailable', { correlationId: 'corr-suite-restore' })}
      onClose={() => undefined}
      onRestore={onRestore}
    />)

    expect(screen.getByText('corr-suite-restore')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry restore suite' }))
    expect(onRestore).toHaveBeenCalledWith(undefined)
  })
})
