export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly correlationId?: string
  readonly fieldErrors: Record<string, string>

  constructor(status: number, message: string, details: { code?: string; correlationId?: string; errors?: Record<string, string> } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = details.code
    this.correlationId = details.correlationId
    this.fieldErrors = details.errors ?? {}
  }
}

type ProblemViolation = { path?: string; message?: string }

export function normalizeFieldErrors(errors?: Record<string, string> | ProblemViolation[]) {
  if (!errors) return {}
  if (!Array.isArray(errors)) return errors
  return errors.reduce<Record<string, string>>((result, error) => {
    if (error.path && error.message && !result[error.path]) result[error.path] = error.message
    return result
  }, {})
}

type AuthResponseLike = { accessToken: string }

let accessToken: string | null = null
let refreshPromise: Promise<unknown> | null = null

export function setAccessToken(token: string) {
  accessToken = token
}

export function clearAccessToken() {
  accessToken = null
}

async function refreshInMemory(): Promise<unknown> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }).then(async (response) => {
      if (!response.ok) throw new ApiError(response.status, 'Session refresh failed')
      const session = (await response.json()) as AuthResponseLike
      setAccessToken(session.accessToken)
      return session
    }).finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

function canRefresh(input: RequestInfo | URL) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url
  return !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/email/')
    && !url.includes('/auth/refresh') && !url.includes('/auth/logout')
}

async function request<T>(input: RequestInfo | URL, init: RequestInit | undefined, allowRetry: boolean): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  })

  if (response.status === 401 && allowRetry && canRefresh(input)) {
    try {
      await refreshInMemory()
      return request<T>(input, init, false)
    } catch {
      clearAccessToken()
    }
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    let details: { code?: string; correlationId?: string; errors?: Record<string, string> } = {}
    try {
      const problem = (await response.json()) as { message?: string; detail?: string; code?: string; correlationId?: string; errors?: Record<string, string> | ProblemViolation[] }
      message = problem.message ?? problem.detail ?? message
      details = { code: problem.code, correlationId: problem.correlationId, errors: normalizeFieldErrors(problem.errors) }
    } catch {
      // Keep the status-based fallback for empty and non-JSON responses.
    }
    throw new ApiError(response.status, message, details)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  return request<T>(input, init, true)
}

export async function apiBlobFetch(input: RequestInfo | URL): Promise<Blob> {
  const response = await fetch(input, { credentials: 'include', headers: { Accept: 'application/octet-stream', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) } })
  if (response.status === 401) { await refreshInMemory(); return apiBlobFetch(input) }
  if (!response.ok) throw new ApiError(response.status, 'Artifact download failed')
  return response.blob()
}

export async function refreshAccessToken<T extends AuthResponseLike>() {
  return refreshInMemory() as Promise<T>
}
