import { describe, expect, it } from 'vitest'

import { buildOnboardingChecklist } from './ProjectWorkspaceContext'
import type { Project } from './api'

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Storefront',
    targetOrigin: 'http://localhost:3201',
    status: 'ACTIVE',
    version: 0,
    createdAt: '2026-07-29T00:00:00Z',
    updatedAt: '2026-07-29T00:00:00Z',
    permissions: ['PROJECT_VIEW'],
    targetHealth: { status: 'REACHABLE' },
    onboarding: { suiteCount: 1, caseCount: 2, readyCaseCount: 1, executionCount: 0 },
    ...overrides,
  }
}

describe('project onboarding checklist', () => {
  it('derives completion entirely from the project aggregate', () => {
    const checklist = buildOnboardingChecklist(project(), '/projects/project-1')

    expect(checklist.map(item => item.done)).toEqual([true, true, true, true, false])
    expect(checklist.at(-1)?.href).toBe('/projects/project-1/executions')
  })

  it('keeps every task incomplete for a new unchecked project', () => {
    const checklist = buildOnboardingChecklist(project({
      targetHealth: { status: 'NOT_CHECKED' },
      onboarding: { suiteCount: 0, caseCount: 0, readyCaseCount: 0, executionCount: 0 },
    }), '/projects/project-1')

    expect(checklist.every(item => !item.done)).toBe(true)
  })
})
