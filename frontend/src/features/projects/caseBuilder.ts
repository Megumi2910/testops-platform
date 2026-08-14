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
    locatorIndex: step.locatorIndex,
    inputValue: step.inputValue,
    expectedValue: step.expectedValue,
    timeoutMs: step.timeoutMs,
    viewportWidth: step.viewportWidth,
    viewportHeight: step.viewportHeight,
    locale: step.locale,
    timezoneId: step.timezoneId,
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
    if (step.locatorIndex !== undefined && (!Number.isInteger(step.locatorIndex) || step.locatorIndex < 0)) setError('Locator index must be a whole number zero or greater.')
    const hasViewportWidth = step.viewportWidth !== undefined
    const hasViewportHeight = step.viewportHeight !== undefined
    if (hasViewportWidth !== hasViewportHeight) setError('Viewport width and height must be provided together.')
    if (hasViewportWidth && (step.viewportWidth! < 320 || step.viewportWidth! > 3840 || step.viewportHeight! < 240 || step.viewportHeight! > 2160)) setError('Viewport must be between 320x240 and 3840x2160.')
    if (step.position !== 0 && (hasViewportWidth || hasViewportHeight || !!step.locale?.trim() || !!step.timezoneId?.trim())) setError('Browser context settings belong on the first step.')
    if (step.locale?.trim() && !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(step.locale.trim())) setError('Locale must be a BCP-47 language tag such as en-US.')
    if (step.timezoneId?.trim() && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(step.timezoneId.trim())) setError('Timezone must be an IANA id such as Asia/Ho_Chi_Minh.')
    if (step.timeoutMs !== undefined && (step.timeoutMs < 100 || step.timeoutMs > 120000)) setError('Timeout must be between 100 and 120000 milliseconds.')
  })
  return { errors, message: Object.keys(errors).length ? 'Fix the highlighted step before saving as READY.' : undefined }
}

export function mapServerStepErrors(fieldErrors: Record<string, string>, steps: EditableStep[]) {
  return Object.entries(fieldErrors).reduce<Record<string, string>>((mapped, [path, message]) => {
    const match = /^steps\[(\d+)](?:\.|$)/.exec(path)
    if (!match) return mapped
    const step = steps[Number(match[1])]
    if (step) mapped[step.clientId] ??= message
    return mapped
  }, {})
}
