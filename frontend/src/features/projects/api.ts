import { apiFetch } from '../../lib/api'

export type PageResponse<T> = { content: T[]; page: number; size: number; totalElements: number; totalPages: number }
export type Project = { id: string; name: string; description?: string; targetOrigin: string; status: 'ACTIVE' | 'ARCHIVED'; version: number; createdAt: string; updatedAt: string }
export type Member = { userId: string; email: string; displayName: string; role: string; version: number }
export type Variable = { key: string; secret: boolean; value?: string; version: number }
export type Suite = { id: string; projectId: string; name: string; description?: string; status: string; version: number }
export type Step = { id?: string; position: number; action: string; locatorType?: string; locatorValue?: string; inputValue?: string; timeoutMs?: number }
export type TestCase = { id: string; suiteId: string; name: string; description?: string; status: string; priority: string; tags?: string; retryCount: number; dataIsolation: boolean; version: number; steps: Step[] }

export const projectKeys = {
  all: ['projects'] as const,
  list: (query: string) => ['projects', 'list', query] as const,
  detail: (id: string) => ['projects', id] as const,
  members: (id: string) => ['projects', id, 'members'] as const,
  variables: (id: string) => ['projects', id, 'variables'] as const,
  suites: (id: string) => ['projects', id, 'suites'] as const,
  cases: (projectId: string, suiteId: string) => ['projects', projectId, 'suites', suiteId, 'cases'] as const,
}

export const projectsApi = {
  list: (search = '') => apiFetch<PageResponse<Project>>(`/api/v1/projects?size=50${search ? `&q=${encodeURIComponent(search)}` : ''}`),
  create: (input: { name: string; description?: string; targetOrigin: string }) => apiFetch<Project>('/api/v1/projects', { method: 'POST', body: JSON.stringify(input) }),
  get: (id: string) => apiFetch<Project>(`/api/v1/projects/${id}`),
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
}
