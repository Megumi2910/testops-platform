import { describe, expect, it } from 'vitest'

import { normalizeFieldErrors } from './api'

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
})
