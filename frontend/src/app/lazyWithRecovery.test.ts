import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isChunkLoadError, recoverFromChunkError } from './lazyWithRecovery'

describe('lazy route recovery', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/projects')
  })

  it('recognizes Vite dynamic-import failures but not ordinary route errors', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/projects.js'))).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed'))).toBe(true)
    expect(isChunkLoadError(new Error('The API returned 500'))).toBe(false)
  })

  it('reloads once per revision and route', () => {
    const reload = vi.fn()
    const error = new Error('Failed to fetch dynamically imported module')

    expect(recoverFromChunkError(error, undefined, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(recoverFromChunkError(error, undefined, reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)

    window.history.pushState({}, '', '/account')
    expect(recoverFromChunkError(error, undefined, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
