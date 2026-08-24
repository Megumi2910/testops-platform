import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiBlobFetch, apiFetch, clearAccessToken, normalizeFieldErrors, setAccessToken, subscribeAuthFailure } from './api'

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
})

describe('normalizeFieldErrors', () => {
  it('converts structured problem violations for existing form consumers', () => {
    expect(normalizeFieldErrors([
      { path: 'steps[2].locatorRole', message: 'Choose a supported role' },
      { path: 'name', message: 'Name is required' },
    ])).toEqual({
      'steps[2].locatorRole': 'Choose a supported role',
      name: 'Name is required',
    })
  })

  it('preserves the compatibility map during the transition milestone', () => {
    expect(normalizeFieldErrors({ email: 'Email is invalid' })).toEqual({ email: 'Email is invalid' })
  })

  it('publishes one terminal auth failure and bounds JSON refresh to one retry', async () => {
    setAccessToken('stale')
    const listener = vi.fn()
    const unsubscribe = subscribeAuthFailure(listener)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 })))

    await expect(apiFetch('/api/v1/projects')).rejects.toMatchObject({ status: 401 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('clears authenticated state when a blob refresh fails without recursion', async () => {
    setAccessToken('stale')
    const listener = vi.fn()
    subscribeAuthFailure(listener)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 })))

    await expect(apiBlobFetch('/api/v1/artifacts/1/download')).rejects.toMatchObject({ status: 401 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
