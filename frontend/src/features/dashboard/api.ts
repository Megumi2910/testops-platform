import { apiFetch } from '../../lib/api'

export type DashboardSummary = { totalExecutions: number; passedCases: number; failedCases: number; infrastructureErrors: number; functionalPassRate: number; infrastructureErrorRate: number; from: string; to: string }
export type Trend = { day: string; passed: number; failed: number; errors: number }
export type RecentFailure = { executionId: string; projectId: string; caseId: string; caseName: string; category?: string; message?: string; finishedAt?: string }
export type InfrastructureError = { category: string; count: number }
export const dashboardApi = { summary: (from: string, to: string) => apiFetch<DashboardSummary>(`/api/v1/dashboard/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`), trends: (from: string, to: string) => apiFetch<Trend[]>(`/api/v1/dashboard/trends?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`), recent: (from: string, to: string) => apiFetch<RecentFailure[]>(`/api/v1/dashboard/recent-failures?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`), infrastructure: (from: string, to: string) => apiFetch<InfrastructureError[]>(`/api/v1/dashboard/infrastructure-errors?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`) }
