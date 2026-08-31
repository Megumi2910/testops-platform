import type { InputHTMLAttributes } from 'react'

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  error?: string
}

/**
 * Keeps authentication inputs consistently labelled and connects server-side
 * field violations to the control that needs correction.
 */
export function AuthField({ id, label, error, ...inputProps }: AuthFieldProps) {
  const errorId = `${id}-error`
  return <label htmlFor={id}>
    {label}
    <input
      {...inputProps}
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    />
    {error && <small id={errorId} className="form-error" role="alert">{error}</small>}
  </label>
}
