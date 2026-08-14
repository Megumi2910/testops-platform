import { useOutletContext } from 'react-router-dom'

import type { Project } from './api'

export type ProjectWorkspaceContext = {
  project: Project
  root: string
}

export function useProjectWorkspace() {
  return useOutletContext<ProjectWorkspaceContext>()
}

export function buildOnboardingChecklist(project: Project, root: string) {
  return [
    { label: 'Open and check the target', done: project.targetHealth?.status === 'REACHABLE', href: project.targetOrigin, external: true },
    { label: 'Create a suite', done: project.onboarding.suiteCount > 0, href: `${root}/suites` },
    { label: 'Create a test case', done: project.onboarding.caseCount > 0, href: `${root}/suites` },
    { label: 'Mark a case READY', done: project.onboarding.readyCaseCount > 0, href: `${root}/suites` },
    { label: 'Run a case and inspect evidence', done: project.onboarding.executionCount > 0, href: `${root}/executions` },
  ]
}

export type TargetHealthGuidance = {
  tone: 'danger' | 'warning'
  title: string
  body: string
  details?: string
}

/**
 * Turns a persisted target-check result into recovery advice that a new
 * operator can act on without having to infer whether the failure is policy,
 * transport, or application-level.
 */
export function targetHealthGuidance(project: Project): TargetHealthGuidance | null {
  const health = project.targetHealth
  if (!health || health.status === 'REACHABLE' || health.status === 'NOT_CHECKED') return null

  if (health.status === 'BLOCKED') {
    const isLocal = project.targetOrigin.toLowerCase().startsWith('http://localhost:')
    return {
      tone: 'danger',
      title: isLocal ? 'Local target access is disabled by the backend.' : 'This target is blocked by the safety policy.',
      body: isLocal
        ? 'Enable the local development bridge and keep this exact origin in TARGET_ALLOWED_ORIGINS, then recreate the backend container.'
        : 'The target is not usable under the current allowlist and navigation policy. Choose a configured origin or update the policy deliberately.',
      details: isLocal
        ? `TARGET_ALLOWED_ORIGINS=${project.targetOrigin} · TARGET_LOCAL_DEV_ENABLED=true · TARGET_LOCAL_DEV_HOST_ALIAS=host.docker.internal`
        : health.reason,
    }
  }

  return {
    tone: 'warning',
    title: 'The target could not be reached.',
    body: 'Start the website, confirm the port and Docker host alias, then run Check connection again.',
    details: health.reason || (health.httpStatus ? `HTTP ${health.httpStatus}` : undefined),
  }
}
