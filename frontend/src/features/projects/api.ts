import { apiFetch } from '../../lib/api'

export type ActionDefinition = { action: string; label: string; locator: boolean; input: boolean; expected: boolean; role: boolean; help: string; locatorRequirement?: 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE'; inputRequirement?: 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE'; expectedRequirement?: 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE'; timeout?: boolean }
export type TargetOriginOption = { origin: string; type: 'EXTERNAL' | 'LOCAL_DEVELOPMENT'; usable: boolean; blockedReason?: string }
export type PlatformOptions = { targetAllowedOrigins: string[]; targetOrigins?: TargetOriginOption[]; targetConfigured: boolean; projectCreationEnabled: boolean; reportingAvailable: boolean; secretVariablesEnabled: boolean; executionWorkerEnabled: boolean; supportedStepActions: string[]; supportedLocatorTypes: string[]; supportedLocatorRoles?: string[]; stepActions?: ActionDefinition[]; localDevelopmentEnabled?: boolean }

export const platformApi = { options: () => apiFetch<PlatformOptions>('/api/v1/platform/options') }

export type PageResponse<T> = { content: T[]; page: number; size: number; totalElements: number; totalPages: number }
export type ProjectPermission = 'PROJECT_VIEW' | 'PROJECT_UPDATE' | 'PROJECT_ARCHIVE' | 'MEMBER_MANAGE' | 'VARIABLE_VIEW' | 'VARIABLE_MANAGE' | 'DEFINITION_VIEW' | 'DEFINITION_MANAGE' | 'EXECUTION_START' | 'EXECUTION_CANCEL_OWN' | 'EXECUTION_CANCEL_ANY' | 'EXECUTION_VIEW' | 'ARTIFACT_VIEW'
export type TargetHealth = { status: 'NOT_CHECKED' | 'REACHABLE' | 'UNREACHABLE' | 'BLOCKED'; httpStatus?: number; checkedAt?: string; reason?: string }
export type ProjectOnboarding = { suiteCount: number; caseCount: number; readyCaseCount: number; executionCount: number }
export type Project = { id: string; name: string; description?: string; targetOrigin: string; status: 'ACTIVE' | 'ARCHIVED'; version: number; createdAt: string; updatedAt: string; currentUserProjectRole?: string; permissions: ProjectPermission[]; targetHealth?: TargetHealth; onboarding: ProjectOnboarding }
export type Member = { userId: string; email: string; displayName: string; role: string; version: number; assignedBy?: string }
export type Variable = { key: string; secret: boolean; value?: string; version: number }
export type Suite = { id: string; projectId: string; name: string; description?: string; status: string; version: number }
export type Step = { id?: string; position: number; action: string; locatorType?: string; locatorValue?: string; locatorRole?: string; locatorIndex?: number; inputValue?: string; expectedValue?: string; timeoutMs?: number; viewportWidth?: number; viewportHeight?: number; locale?: string; timezoneId?: string }
export type TestCase = { id: string; suiteId: string; name: string; description?: string; status: string; priority: string; tags?: string; retryCount: number; dataIsolation: boolean; version: number; steps: Step[] }

export const projectKeys = {
  all: ['projects'] as const,
  list: (query: string) => ['projects', 'list', query] as const,
  detail: (id: string) => ['projects', id] as const,
  members: (id: string) => ['projects', id, 'members'] as const,
  variables: (id: string) => ['projects', id, 'variables'] as const,
  suites: (id: string) => ['projects', id, 'suites'] as const,
  cases: (projectId: string, suiteId: string) => ['projects', projectId, 'suites', suiteId, 'cases'] as const,
  executions: (id: string) => ['projects', id, 'executions'] as const,
  execution: (id: string, executionId: string) => ['projects', id, 'executions', executionId] as const,
}

export type ExecutionArtifact = { id: string; caseResultId?: string; type: string; contentType: string; byteSize: number; sha256: string; secretSuppressed: boolean; createdAt: string; purgedAt?: string; purgeReason?: string; stepPosition?: number }
export type StepResult = { position: number; action: string; status: string; durationMs?: number; errorMessage?: string }
export type CaseResult = { id: string; caseId: string; caseName: string; status: string; attemptCount: number; startedAt?: string; finishedAt?: string; errorMessage?: string; failedStepPosition?: number; errorCategory?: string; steps: StepResult[] }
export type ExecutionSummary = { id: string; projectId: string; suiteId?: string; status: string; totalCases: number; completedCases: number; passedCases: number; failedCases: number; errorCases: number; cancelledCases: number; createdAt: string; startedAt?: string; finishedAt?: string; suiteNameSnapshot?: string; infrastructureErrorCategory?: string }
export type Execution = ExecutionSummary & { errorMessage?: string; browser?: string; targetOriginSnapshot?: string; cases: CaseResult[]; artifacts: ExecutionArtifact[] }

function idempotencyKey() { return crypto.randomUUID() }

export const projectsApi = {
  list: ({ query = '', page = 0, size = 25 }: { query?: string; page?: number; size?: number } = {}) =>
    apiFetch<PageResponse<Project>>(`/api/v1/projects?page=${page}&size=${size}${query ? `&q=${encodeURIComponent(query)}` : ''}`),
  create: (input: { name: string; description?: string; targetOrigin: string }) => apiFetch<Project>('/api/v1/projects', { method: 'POST', body: JSON.stringify(input) }),
  get: (id: string) => apiFetch<Project>(`/api/v1/projects/${id}`),
  targetCheck: (id: string) => apiFetch<{ projectId: string; status: string; httpStatus?: number; checkedAt: string; reason?: string }>(`/api/v1/projects/${id}/target-check`, { method: 'POST' }),
  update: (id: string, input: { name: string; description?: string; targetOrigin: string; projectVersion?: number }) => apiFetch<Project>(`/api/v1/projects/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  archive: (id: string) => apiFetch<Project>(`/api/v1/projects/${id}/archive`, { method: 'POST' }),
  members: (id: string) => apiFetch<Member[]>(`/api/v1/projects/${id}/members`),
  addMember: (id: string, input: { email: string; role: string; projectVersion?: number }) => apiFetch<Member>(`/api/v1/projects/${id}/members`, { method: 'POST', body: JSON.stringify(input) }),
  updateMember: (id: string, userId: string, input: { role: string; projectVersion?: number }) => apiFetch<Member>(`/api/v1/projects/${id}/members/${userId}`, { method: 'PUT', body: JSON.stringify(input) }),
  removeMember: (id: string, userId: string, version?: number) => apiFetch<void>(`/api/v1/projects/${id}/members/${userId}${version === undefined ? '' : `?projectVersion=${version}`}`, { method: 'DELETE' }),
  variables: (id: string) => apiFetch<Variable[]>(`/api/v1/projects/${id}/variables`),
  createVariable: (id: string, input: { key: string; secret: boolean; value: string }) => apiFetch<Variable>(`/api/v1/projects/${id}/variables`, { method: 'POST', body: JSON.stringify(input) }),
  updateVariable: (id: string, key: string, input: { key: string; secret: boolean; value: string }) => apiFetch<Variable>(`/api/v1/projects/${id}/variables/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteVariable: (id: string, key: string) => apiFetch<void>(`/api/v1/projects/${id}/variables/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  suites: (id: string) => apiFetch<Suite[]>(`/api/v1/projects/${id}/suites`),
  createSuite: (id: string, input: { name: string; description?: string }) => apiFetch<Suite>(`/api/v1/projects/${id}/suites`, { method: 'POST', body: JSON.stringify(input) }),
  cases: (projectId: string, suiteId: string) => apiFetch<TestCase[]>(`/api/v1/projects/${projectId}/suites/${suiteId}/cases`),
  getCase: (projectId: string, suiteId: string, caseId: string) => apiFetch<TestCase>(`/api/v1/projects/${projectId}/suites/${suiteId}/cases/${caseId}`),
  createCase: (projectId: string, suiteId: string, input: Record<string, unknown>) => apiFetch<TestCase>(`/api/v1/projects/${projectId}/suites/${suiteId}/cases`, { method: 'POST', body: JSON.stringify(input) }),
  updateCase: (projectId: string, suiteId: string, caseId: string, input: Record<string, unknown>) => apiFetch<TestCase>(`/api/v1/projects/${projectId}/suites/${suiteId}/cases/${caseId}`, { method: 'PUT', body: JSON.stringify(input) }),
  queueSuite: (projectId: string, suiteId: string) => apiFetch<{ executionId: string; status: string }>(`/api/v1/projects/${projectId}/suites/${suiteId}/executions`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() } }),
  queueCase: (projectId: string, suiteId: string, caseId: string) => apiFetch<{ executionId: string; status: string }>(`/api/v1/projects/${projectId}/suites/${suiteId}/cases/${caseId}/executions`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() } }),
  executions: (projectId: string) => apiFetch<ExecutionSummary[]>(`/api/v1/projects/${projectId}/executions`),
  execution: (projectId: string, executionId: string) => apiFetch<Execution>(`/api/v1/projects/${projectId}/executions/${executionId}`),
  cancelExecution: (projectId: string, executionId: string) => apiFetch<void>(`/api/v1/projects/${projectId}/executions/${executionId}/cancel`, { method: 'POST' }),
}
