import { describe, expect, it } from 'vitest'

import { serializeSteps, validateSteps, type EditableStep } from './caseBuilder'
import type { ActionDefinition } from './api'

const definitions: ActionDefinition[] = [
  { action: 'NAVIGATE', label: 'Navigate', locator: false, input: true, expected: false, role: false, help: '/', inputRequirement: 'REQUIRED' },
  { action: 'ASSERT_VISIBLE', label: 'Assert visible', locator: true, input: false, expected: false, role: true, help: 'Heading', locatorRequirement: 'REQUIRED' },
  { action: 'ASSERT_COUNT', label: 'Assert count', locator: true, input: false, expected: true, role: true, help: 'Matching elements', locatorRequirement: 'REQUIRED', expectedRequirement: 'REQUIRED' },
]

describe('guided case validation', () => {
  it('keeps validation attached to the stable client step after reorder', () => {
    const assertion: EditableStep = {
      clientId: 'assertion',
      position: 0,
      action: 'ASSERT_VISIBLE',
      locatorType: 'TEXT',
      locatorValue: '',
    }
    const navigation: EditableStep = {
      clientId: 'navigation',
      position: 1,
      action: 'NAVIGATE',
      inputValue: '/',
    }

    const before = validateSteps([assertion, navigation], definitions)
    const after = validateSteps([navigation, assertion], definitions)

    expect(before.errors.assertion).toContain('first step')
    expect(after.errors.assertion).toContain('locator')
    expect(after.errors.navigation).toBeUndefined()
  })

  it('removes client-only IDs and normalizes positions before persistence', () => {
    const serialized = serializeSteps([
      { clientId: 'second', position: 9, action: 'NAVIGATE', inputValue: '/' },
      { clientId: 'first', position: 3, action: 'ASSERT_VISIBLE', locatorType: 'TEXT', locatorValue: 'Products' },
    ])

    expect(serialized.map(step => step.position)).toEqual([0, 1])
    expect(serialized).not.toEqual(expect.arrayContaining([expect.objectContaining({ clientId: expect.anything() })]))
  })

  it('persists an element index and rejects non-integer indexes', () => {
    const serialized = serializeSteps([{ clientId: 'indexed', position: 0, action: 'ASSERT_VISIBLE', locatorType: 'TEXT_EXACT', locatorValue: 'Products', locatorIndex: 2 }])
    expect(serialized[0].locatorIndex).toBe(2)

    const result = validateSteps([
      { clientId: 'navigate', position: 0, action: 'NAVIGATE', inputValue: '/' },
      { clientId: 'indexed', position: 1, action: 'ASSERT_VISIBLE', locatorType: 'TEXT', locatorValue: 'Products', locatorIndex: 1.5 },
    ], definitions)
    expect(result.errors.indexed).toContain('whole number')
  })

  it('keeps browser context settings on the first step and validates their shape', () => {
    const result = validateSteps([
      { clientId: 'navigate', position: 0, action: 'NAVIGATE', inputValue: '/', viewportWidth: 1280, viewportHeight: 720, locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh' },
      { clientId: 'assertion', position: 1, action: 'ASSERT_VISIBLE', locatorType: 'TEXT', locatorValue: 'Products', viewportWidth: 640, viewportHeight: 480 },
    ], definitions)
    expect(result.errors.assertion).toContain('first step')
    expect(serializeSteps([{ clientId: 'navigate', position: 0, action: 'NAVIGATE', inputValue: '/', viewportWidth: 1280, viewportHeight: 720, locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh' }])[0]).toMatchObject({ viewportWidth: 1280, viewportHeight: 720, locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh' })
  })

  it('rejects malformed count assertions before a READY case is sent', () => {
    const result = validateSteps([
      { clientId: 'navigate', position: 0, action: 'NAVIGATE', inputValue: '/' },
      { clientId: 'count', position: 1, action: 'ASSERT_COUNT', locatorType: 'TEXT', locatorValue: 'Product', expectedValue: 'many' },
    ], definitions)

    expect(result.errors.count).toContain('non-negative integer')
  })
})
