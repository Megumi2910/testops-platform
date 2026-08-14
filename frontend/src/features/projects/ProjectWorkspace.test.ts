import { describe, expect, it } from 'vitest'

import { buildOnboardingChecklist, targetHealthGuidance } from './ProjectWorkspaceContext'
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

describe('target health guidance', () => {
  it('explains the exact fail-closed settings for a blocked localhost target', () => {
    const guidance = targetHealthGuidance(project({
      targetHealth: { status: 'BLOCKED', reason: 'local_target_disabled' },
    }))

    expect(guidance?.title).toContain('Local target access is disabled')
    expect(guidance?.body).toContain('TARGET_ALLOWED_ORIGINS')
    expect(guidance?.details).toContain('TARGET_ALLOWED_ORIGINS=http://localhost:3201')
    expect(guidance?.details).toContain('TARGET_LOCAL_DEV_ENABLED=true')
  })

  it('distinguishes an unreachable target from a policy block', () => {
    const guidance = targetHealthGuidance(project({
      targetHealth: { status: 'UNREACHABLE', reason: 'TARGET_TIMEOUT' },
    }))

    expect(guidance?.tone).toBe('warning')
    expect(guidance?.title).toBe('The target could not be reached.')
    expect(guidance?.details).toBe('TARGET_TIMEOUT')
  })

  it('does not show recovery advice before a check or after success', () => {
    expect(targetHealthGuidance(project({ targetHealth: { status: 'NOT_CHECKED' } }))).toBeNull()
    expect(targetHealthGuidance(project({ targetHealth: { status: 'REACHABLE' } }))).toBeNull()
  })
})
