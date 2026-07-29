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
