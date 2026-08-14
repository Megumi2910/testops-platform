import { lazy } from 'react'

type LazyLoader = Parameters<typeof lazy>[0]

const recoveryKeyPrefix = 'testops:lazy-route-recovery'

export const applicationRevision = import.meta.env.VITE_APP_REVISION || 'development'

export function isChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) return false
  return /chunkloaderror|failed to fetch dynamically imported module|importing a module script failed|unable to preload css|module script/i.test(error.message)
}

function recoveryKey(route: string) {
  return `${recoveryKeyPrefix}:${applicationRevision}:${route}`
}

/**
 * Reload a stale tab once for the current build and route. The session marker
 * prevents a failed deployment from creating an infinite reload loop while
 * still allowing a later application revision to recover independently.
 */
export function recoverFromChunkError(
  error: unknown,
  route = window.location.pathname + window.location.search + window.location.hash,
  reload = () => window.location.reload(),
) {
  if (!isChunkLoadError(error)) return false

  try {
    const key = recoveryKey(route)
    if (window.sessionStorage.getItem(key)) return false
    window.sessionStorage.setItem(key, '1')
    reload()
    return true
  } catch {
    // Storage can be unavailable in privacy-restricted contexts. The route
    // error page still renders, but recovery remains a safe manual action.
    return false
  }
}

export function lazyWithRecovery(loader: LazyLoader) {
  return lazy(async () => {
    try {
      return await loader()
    } catch (error) {
      recoverFromChunkError(error)
      throw error
    }
  })
}
