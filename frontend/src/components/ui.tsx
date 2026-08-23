import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef } from 'react'

export type IconName = 'alert' | 'check' | 'info' | 'loader' | 'close' | 'menu' | 'shield' | 'folder' | 'dashboard' | 'logout' | 'arrow'

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<IconName, string> = {
    alert: 'M12 9v4m0 4h.01M10.3 3.6 2.5 17a1.4 1.4 0 0 0 1.2 2.1h16.6a1.4 1.4 0 0 0 1.2-2.1L13.7 3.6a2 2 0 0 0-3.4 0Z',
    check: 'm5 12 4 4L19 6',
    info: 'M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    loader: 'M12 3a9 9 0 1 0 9 9',
    close: 'm6 6 12 12M18 6 6 18',
    menu: 'M4 6h16M4 12h16M4 18h16',
    shield: 'M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z',
    folder: 'M3 7h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
    dashboard: 'M4 13h6V4H4v9Zm10 7h6v-7h-6v7ZM4 20h6v-3H4v3Zm10-11h6V4h-6v5Z',
    logout: 'M10 17l5-5-5-5m5 5H3m9-9h5a2 2 0 0 1 2 2v2m0 6v2a2 2 0 0 1-2 2h-5',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
  }
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  busy?: boolean
  children: ReactNode
}

export function Button({ variant = 'primary', busy = false, children, disabled, className = '', ...props }: ButtonProps) {
  return (
    <button className={`button button-${variant} ${className}`.trim()} disabled={disabled || busy} {...props}>
      {busy && <Icon name="loader" className="button-icon spin" size={16} />}
      {busy ? 'Working…' : children}
    </button>
  )
}

export function IconButton({ label, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={`icon-button ${className}`.trim()} aria-label={label} title={label} {...props}>{children}</button>
}

export function Card({ children, className = '', as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={`card ${className}`.trim()}>{children}</Tag>
}

export function StatusBadge({ status, children }: { status: 'success' | 'warning' | 'danger' | 'neutral' | 'info'; children: ReactNode }) {
  return <span className={`status-badge status-${status}`}><span className="status-badge-dot" aria-hidden="true" />{children}</span>
}

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: string; children: ReactNode }) {
  return <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}><Icon name={tone === 'success' ? 'check' : tone === 'danger' ? 'alert' : 'info'} /><div>{title && <strong>{title}</strong>}<div>{children}</div></div></div>
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-state-icon" aria-hidden="true">{icon ?? <Icon name="info" size={22} />}</div><h2>{title}</h2><p>{description}</p>{action && <div className="inline-actions">{action}</div>}</div>
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading-state" role="status"><Icon name="loader" className="spin" size={20} />{label}</div>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div className="page-heading-copy">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="lede">{description}</p>}</div>{actions && <div className="page-heading-actions">{actions}</div>}</div>
}

const dialogFocusableSelector = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), a[href]:not([tabindex="-1"])'

function dialogFocusables(dialog: HTMLElement | null) {
  return Array.from(dialog?.querySelectorAll<HTMLElement>(dialogFocusableSelector) ?? [])
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', confirmVariant = 'danger', busy = false, children, onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel?: string; confirmVariant?: ButtonVariant; busy?: boolean; children?: ReactNode; onConfirm: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const busyRef = useRef(busy)
  const onCloseRef = useRef(onClose)
  busyRef.current = busy
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => dialogFocusables(dialogRef.current)
    const focusInsideDialog = (preferLast = false) => {
      const items = focusable()
      const target = preferLast ? items.at(-1) : items[0]
      const focusTarget = target ?? dialogRef.current
      focusTarget?.focus()
    }
    focusInsideDialog()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) onCloseRef.current()
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (!items.includes(document.activeElement as HTMLElement)) {
        event.preventDefault()
        focusInsideDialog(event.shiftKey)
        return
      }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus.current?.isConnected) previousFocus.current.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const items = dialogFocusables(dialogRef.current)
    if (!items.includes(document.activeElement as HTMLElement)) (items[0] ?? dialogRef.current)?.focus()
  }, [busy, open])

  if (!open) return null
  return <div ref={dialogRef} className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description" tabIndex={-1}><button type="button" aria-label="Dismiss dialog" tabIndex={-1} disabled={busy} onClick={onClose} style={{ background: 'transparent', border: 0, cursor: 'default', inset: 0, padding: 0, position: 'absolute', transform: 'none', zIndex: 0 }} /><div className="dialog" style={{ position: 'relative', zIndex: 1 }}><div className="dialog-header"><h2 id="dialog-title">{title}</h2><IconButton label="Close dialog" onClick={onClose} disabled={busy}><Icon name="close" size={18} /></IconButton></div><p id="dialog-description">{description}</p>{children}<div className="dialog-actions"><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant={confirmVariant} busy={busy} onClick={onConfirm}>{confirmLabel}</Button></div></div></div>
}
