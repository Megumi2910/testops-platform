import type { ActionDefinition, Step } from './api'

export type EditableStep = Step & { clientId: string }

export function toEditableSteps(steps: Step[]): EditableStep[] {
  return steps.map(step => ({ ...step, clientId: crypto.randomUUID() }))
}

export function serializeSteps(steps: EditableStep[]): Step[] {
  return steps.map((step, position) => ({
    id: step.id,
    position,
    action: step.action,
    locatorType: step.locatorType,
    locatorValue: step.locatorValue,
    locatorRole: step.locatorRole,
    inputValue: step.inputValue,
    expectedValue: step.expectedValue,
    timeoutMs: step.timeoutMs,
  }))
}

export function requirement(definition: ActionDefinition | undefined, field: 'locator' | 'input' | 'expected') {
  const value = definition?.[`${field}Requirement` as keyof ActionDefinition]
  if (value === 'REQUIRED' || value === 'OPTIONAL' || value === 'NOT_APPLICABLE') return value
  return definition?.[field] ? 'REQUIRED' : 'NOT_APPLICABLE'
}

export function validateSteps(steps: EditableStep[], definitions: ActionDefinition[]) {
  const errors: Record<string, string> = {}
  if (steps.length === 0) return { errors, message: 'A READY case needs at least one step.' }
  if (steps[0]?.action !== 'NAVIGATE') errors[steps[0].clientId] = 'The first step must be NAVIGATE.'
  steps.forEach(step => {
    const definition = definitions.find(item => item.action === step.action)
    const setError = (message: string) => { errors[step.clientId] ??= message }
    if (requirement(definition, 'locator') === 'REQUIRED' && (!step.locatorType || !step.locatorValue?.trim())) setError('Choose a locator type and enter its value.')
    if (requirement(definition, 'input') === 'REQUIRED' && !step.inputValue?.trim()) setError('Enter an input value for this action.')
    if (requirement(definition, 'expected') === 'REQUIRED' && !step.expectedValue?.trim()) setError('Enter the expected value for this assertion.')
    if (step.action === 'ASSERT_COUNT' && step.expectedValue?.trim() && !/^\d+$/.test(step.expectedValue.trim())) setError('Expected count must be a non-negative integer.')
    if (step.locatorType === 'ROLE' && !step.locatorRole) setError('Choose an ARIA role when using ROLE.')
    if (step.timeoutMs !== undefined && (step.timeoutMs < 100 || step.timeoutMs > 120000)) setError('Timeout must be between 100 and 120000 milliseconds.')
  })
  return { errors, message: Object.keys(errors).length ? 'Fix the highlighted step before saving as READY.' : undefined }
}
