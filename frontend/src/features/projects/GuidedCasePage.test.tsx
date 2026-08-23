import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { keepBrowserContextOnFirstStep, mapServerStepErrors, serializeSteps, validateSteps, type EditableStep } from './caseBuilder'
import { platformApi, projectsApi, type ActionDefinition } from './api'
import { GuidedNewCasePage } from './GuidedCasePage'

const definitions: ActionDefinition[] = [
  { action: 'NAVIGATE', label: 'Navigate', locator: false, input: true, expected: false, role: false, help: '/', inputRequirement: 'REQUIRED' },
  { action: 'ASSERT_VISIBLE', label: 'Assert visible', locator: true, input: false, expected: false, role: true, help: 'Heading', locatorRequirement: 'REQUIRED' },
  { action: 'ASSERT_COUNT', label: 'Assert count', locator: true, input: false, expected: true, role: true, help: 'Matching elements', locatorRequirement: 'REQUIRED', expectedRequirement: 'REQUIRED' },
]

afterEach(() => vi.restoreAllMocks())

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

    expect(before.errors.assertion).toMatchObject({ field: 'action', message: expect.stringContaining('first step') })
    expect(after.errors.assertion).toMatchObject({ field: 'locatorValue', message: expect.stringContaining('locator') })
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
    expect(result.errors.indexed).toMatchObject({ field: 'locatorIndex', message: expect.stringContaining('whole number') })
  })

  it('keeps browser context settings on the first step and validates their shape', () => {
    const result = validateSteps([
      { clientId: 'navigate', position: 0, action: 'NAVIGATE', inputValue: '/', viewportWidth: 1280, viewportHeight: 720, locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh' },
      { clientId: 'assertion', position: 1, action: 'ASSERT_VISIBLE', locatorType: 'TEXT', locatorValue: 'Products', viewportWidth: 640, viewportHeight: 480 },
    ], definitions)
    expect(result.errors.assertion).toMatchObject({ field: 'viewportWidth', message: expect.stringContaining('first step') })
    expect(serializeSteps([{ clientId: 'navigate', position: 0, action: 'NAVIGATE', inputValue: '/', viewportWidth: 1280, viewportHeight: 720, locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh' }])[0]).toMatchObject({ viewportWidth: 1280, viewportHeight: 720, locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh' })
  })

  it('transfers browser context to the new first step after reorder or removal', () => {
    const original: EditableStep[] = [
      { clientId: 'first', position: 0, action: 'NAVIGATE', inputValue: '/', viewportWidth: 1280, viewportHeight: 720, locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh' },
      { clientId: 'second', position: 1, action: 'NAVIGATE', inputValue: '/checkout' },
      { clientId: 'third', position: 2, action: 'ASSERT_VISIBLE', locatorType: 'TEXT', locatorValue: 'Checkout' },
    ]

    const reordered = keepBrowserContextOnFirstStep(original, [original[1], original[0], original[2]])
    expect(reordered[0]).toMatchObject({ clientId: 'second', position: 0, viewportWidth: 1280, viewportHeight: 720, locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh' })
    expect(reordered[1]).toMatchObject({ clientId: 'first', position: 1, viewportWidth: undefined, viewportHeight: undefined, locale: undefined, timezoneId: undefined })
    expect(validateSteps(reordered, definitions).message).toBeUndefined()

    const removed = keepBrowserContextOnFirstStep(original, original.slice(1))
    expect(removed[0]).toMatchObject({ clientId: 'second', position: 0, viewportWidth: 1280, viewportHeight: 720, locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh' })
    expect(validateSteps(removed, definitions).message).toBeUndefined()
  })

  it('rejects malformed count assertions before a READY case is sent', () => {
    const result = validateSteps([
      { clientId: 'navigate', position: 0, action: 'NAVIGATE', inputValue: '/' },
      { clientId: 'count', position: 1, action: 'ASSERT_COUNT', locatorType: 'TEXT', locatorValue: 'Product', expectedValue: 'many' },
    ], definitions)

    expect(result.errors.count).toMatchObject({ field: 'expectedValue', message: expect.stringContaining('non-negative integer') })
  })

  it('maps backend step paths onto stable client step identities', () => {
    const steps: EditableStep[] = [
      { clientId: 'navigation', position: 0, action: 'NAVIGATE', inputValue: '/' },
      { clientId: 'assertion', position: 1, action: 'ASSERT_VISIBLE', locatorType: 'ROLE', locatorValue: 'Search' },
    ]

    expect(mapServerStepErrors({ 'steps[1].locatorRole': 'Choose a supported ARIA role.', name: 'Ignored here' }, steps)).toEqual({ assertion: { field: 'locatorRole', message: 'Choose a supported ARIA role.' } })
  })

  it('renders supported metadata and blocks leaving Details with an empty name', async () => {
    vi.spyOn(platformApi, 'options').mockResolvedValue({
      targetAllowedOrigins: [], targetConfigured: true, projectCreationEnabled: true, reportingAvailable: true,
      secretVariablesEnabled: true, executionWorkerEnabled: true, supportedStepActions: definitions.map(item => item.action),
      supportedLocatorTypes: ['TEXT', 'ROLE'], supportedLocatorRoles: ['button'], stepActions: definitions,
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const router = createMemoryRouter([{ path: '/projects/:projectId/suites/:suiteId/cases/new', element: <GuidedNewCasePage /> }], { initialEntries: ['/projects/project-1/suites/suite-1/cases/new'] })
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)

    expect(await screen.findByPlaceholderText('P0, smoke')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Use a fresh isolated browser context for this case' })).toBeChecked()
    const name = screen.getByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to steps' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required')
    expect(name).toHaveFocus()
    expect(screen.getByText('1. Details')).toHaveClass('active')
  })

  it('returns to Steps and focuses the exact invalid nested field before saving READY', async () => {
    vi.spyOn(platformApi, 'options').mockResolvedValue({
      targetAllowedOrigins: [], targetConfigured: true, projectCreationEnabled: true, reportingAvailable: true,
      secretVariablesEnabled: true, executionWorkerEnabled: true, supportedStepActions: definitions.map(item => item.action),
      supportedLocatorTypes: ['TEXT', 'ROLE'], supportedLocatorRoles: ['button'], stepActions: definitions,
    })
    const create = vi.spyOn(projectsApi, 'createCase')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const router = createMemoryRouter([{ path: '/projects/:projectId/suites/:suiteId/cases/new', element: <GuidedNewCasePage /> }], { initialEntries: ['/projects/project-1/suites/suite-1/cases/new'] })
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)

    await screen.findByRole('button', { name: 'Continue to steps' })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to steps' }))
    const locatorValue = await screen.findByRole('textbox', { name: 'Locator value' })
    fireEvent.change(locatorValue, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review case' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save as READY' }))

    const invalidLocator = await screen.findByRole('textbox', { name: 'Locator value' })
    expect(screen.getByText('2. Steps')).toHaveClass('active')
    expect(invalidLocator).toHaveFocus()
    expect(invalidLocator).toHaveAttribute('name', 'steps[1].locatorValue')
    expect(invalidLocator).toHaveAttribute('aria-invalid', 'true')
    expect(invalidLocator.getAttribute('aria-describedby')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })
})
