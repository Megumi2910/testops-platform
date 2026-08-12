import type { Location } from 'react-router-dom'

export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  return value
}

export function locationReturnTo(location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  return `${location.pathname}${location.search}${location.hash}`
}
