export type ExecutionFailureGuidance = {
  title: string
  detail: string
  recovery: string
}

const guidance: Record<string, ExecutionFailureGuidance> = {
  ASSERTION_FAILURE: {
    title: 'Assertion failed',
    detail: 'The page loaded, but an expected value or state did not match.',
    recovery: 'Check the expected value and confirm the target data is in the intended state before retrying.',
  },
  LOCATOR_FAILURE: {
    title: 'Locator could not be resolved',
    detail: 'The step could not find the requested element.',
    recovery: 'Prefer a stable role, label, or test identifier and verify the element is visible at this point in the journey.',
  },
  LOCATOR_TIMEOUT: {
    title: 'Locator timed out',
    detail: 'The requested element did not become available before the step timeout.',
    recovery: 'Check loading state and locator stability, then adjust the step timeout only when the target genuinely needs more time.',
  },
  TARGET_UNREACHABLE: {
    title: 'Target unreachable',
    detail: 'The worker could not connect to the project target.',
    recovery: 'Start the target, verify its port and target check, then retry after the worker is enabled.',
  },
  BLOCKED_NAVIGATION: {
    title: 'Navigation blocked',
    detail: 'The browser attempted to leave the project’s approved target origin.',
    recovery: 'Keep links, redirects, and form submissions on the configured target origin or update the project target deliberately.',
  },
  WORKER_TIMEOUT: {
    title: 'Execution timed out',
    detail: 'The run exceeded the configured execution limit.',
    recovery: 'Review slow steps, reduce unnecessary waits, or split the journey before retrying.',
  },
  BROWSER_CRASH: {
    title: 'Browser crashed',
    detail: 'The worker browser closed before the run could finish.',
    recovery: 'Retry once, then check worker memory and browser logs if the crash repeats.',
  },
  WORKER_INFRASTRUCTURE: {
    title: 'Worker infrastructure failure',
    detail: 'The worker could not complete the run for an environment-related reason.',
    recovery: 'Confirm the worker is enabled and healthy, then retry the execution.',
  },
  INVALID_DEFINITION: {
    title: 'Invalid test definition',
    detail: 'The queued case definition is not executable.',
    recovery: 'Open the case, resolve the highlighted validation errors, save it as READY, and queue it again.',
  },
}

const fallback: ExecutionFailureGuidance = {
  title: 'Execution failed',
  detail: 'The worker reported a failure that is not mapped to a more specific category.',
  recovery: 'Review the sanitized error and step results, then retry or correct the case definition.',
}

export function getExecutionFailureGuidance(category?: string): ExecutionFailureGuidance {
  if (!category) return fallback
  return guidance[category.toUpperCase()] ?? fallback
}
