# Frontend Code Walkthrough

This document explains the React and TypeScript code that turns backend state into the TestOps workspace.

## 1. Frontend technology

The frontend is defined in [`frontend/package.json`](../frontend/package.json).

| Concern | Implementation |
| --- | --- |
| UI | React 19 |
| Language | TypeScript 5.9 |
| Bundler/dev server | Vite 8 |
| Routing | React Router |
| Server state | TanStack Query |
| Forms | React Hook Form |
| Validation | Zod + `@hookform/resolvers` |
| Tests | Vitest + Testing Library + jsdom |
| Production web server | Nginx |

There is no global state-management library. Authentication has a small React context because many components need the current user; remote project/execution data lives in TanStack Query.

## 2. TypeScript syntax used in this project

### Type aliases and object shapes

```ts
export type Project = {
  id: string
  name: string
  status: 'ACTIVE' | 'ARCHIVED'
  permissions: ProjectPermission[]
}
```

`type` describes the shape of data at compile time. The string union limits `status` to known values and lets TypeScript catch invalid comparisons or missing cases.

### Literal unions

```ts
export type ProjectPermission =
  | 'PROJECT_VIEW'
  | 'PROJECT_UPDATE'
  | 'EXECUTION_START'
  | 'EXECUTION_VIEW'
```

This is useful for server-defined capability names. It does not enforce authorization at runtime; the backend still decides whether a request is allowed.

### Generics

```ts
apiFetch<PageResponse<Project>>('/api/v1/projects?...')
```

`PageResponse<Project>` means the JSON should contain a page whose `content` items are `Project`. The generic helps the editor and compiler; it does not validate untrusted JSON at runtime.

### Type-only imports

```ts
import type { PropsWithChildren } from 'react'
```

Type-only imports are removed from emitted JavaScript. They document that the import is needed only for static checking.

### Async functions and promises

```ts
login: async (email, password) => {
  const response = await authApi.login({ email, password })
  setUser(response.user)
}
```

`async` makes the function return a `Promise`; `await` pauses that function until the request finishes. React event handlers call it with `void` when they intentionally do not return the Promise to React.

### React hooks

- `useState` stores local component state.
- `useEffect` runs synchronization work after rendering.
- `useMemo` preserves a derived object until dependencies change.
- `useCallback` preserves a function identity for an effect/dependency relationship.
- `useContext` reads shared context.
- `useQuery` reads cached server state.
- `useMutation` runs a server-side write and exposes pending/error/success state.

## 3. Application bootstrap

The entry point is [`main.tsx`](../frontend/src/main.tsx):

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
```

The `!` after `getElementById('root')` is the TypeScript non-null assertion. It tells the compiler that `index.html` is expected to contain the root element.

The provider nesting matters:

```text
QueryClientProvider
  → AuthProvider
    → RouterProvider
      → route components
```

`AuthProvider` and pages can use TanStack Query because they are rendered below `QueryClientProvider`. All routes can use authentication because they are rendered below `AuthProvider`.

[`queryClient.ts`](../frontend/src/app/queryClient.ts) sets a 30-second default stale time and disables automatic retries. Disabling retries makes local errors visible and avoids repeatedly re-running sensitive requests such as auth calls.

## 4. Routing and page composition

[`router.tsx`](../frontend/src/app/router.tsx) defines the URL tree. The top-level route renders [`AppShell`](../frontend/src/components/AppShell.tsx); child routes render inside its `<Outlet />`.

The protected branch is:

```tsx
{
  element: <ProtectedRoute />,
  children: [
    { path: 'account', element: <AccountPage /> },
    { path: 'projects', element: <ProjectsPage /> },
    // ...
  ],
}
```

`ProtectedRoute` checks:

1. Is authentication bootstrap still loading?
2. Is authentication enabled by the backend?
3. Is there a current user?

It redirects to `/` when auth is disabled and `/login` when auth is enabled but no session exists. This is a navigation convenience, not a security mechanism; every protected API route is checked by Spring Security and project services.

Nested project routes use `ProjectLayout` and `<Outlet />`. A URL such as `/projects/{projectId}/suites/{suiteId}` therefore renders the project context and suite content in nested layers.

## 5. The API client and token lifecycle

[`frontend/src/lib/api.ts`](../frontend/src/lib/api.ts) centralizes fetch behavior.

### 5.1 Access token memory

```ts
let accessToken: string | null = null

export function setAccessToken(token: string) {
  accessToken = token
}
```

The token is held in a module variable, not `localStorage` or a persistent cookie. A full page reload clears it, which is why the auth provider performs a refresh bootstrap.

### 5.2 Request construction

The wrapper adds:

- `credentials: 'include'` so the browser sends the refresh cookie;
- `Accept: application/json`;
- `Content-Type: application/json` when a body exists;
- `Authorization: Bearer <access token>` when a token is in memory.

Feature modules can therefore call:

```ts
apiFetch<Project>('/api/v1/projects/123')
```

without repeating headers and credentials logic.

### 5.3 One retry after refresh

When a normal API request returns `401`, the wrapper checks whether the URL is eligible for refresh. Login, registration, refresh, logout, and email routes are excluded to avoid loops. For eligible requests it:

1. calls `/api/v1/auth/refresh` with the cookie;
2. stores the returned access token in memory;
3. retries the original request once;
4. clears the token if refresh fails.

The initial anonymous bootstrap is different from a failed session: the refresh
endpoint returns `204 No Content` when no cookie exists, and the provider keeps
the visitor signed out without publishing an authentication failure. Invalid or
replayed cookies still return `401` and follow the normal cleanup path.

Concurrent requests share one `refreshPromise`, so five simultaneous `401` responses do not rotate the same refresh token five times.

### 5.4 JSON and blob responses

`apiFetch` returns `undefined` for `204` and `202` responses. `apiBlobFetch` is separate because screenshots/traces are binary responses, not JSON.

## 6. Authentication context

[`AuthProvider.tsx`](../frontend/src/features/auth/AuthProvider.tsx) owns the small amount of global identity state:

```tsx
const [user, setUser] = useState<UserSummary | null>(null)
const [providers, setProviders] = useState<Providers | null>(null)
const [loading, setLoading] = useState(true)
```

On mount, `bootstrap`:

1. calls `/api/v1/auth/providers`;
2. stores which authentication features are enabled;
3. calls refresh when auth is enabled;
4. stores the returned user;
5. clears the in-memory token on failure;
6. marks loading complete.

[`AuthContext.ts`](../frontend/src/features/auth/AuthContext.ts) exposes `useAuth()`. It throws when used outside the provider, which catches an architectural mistake early.

The auth API module is intentionally thin. For example, `login` calls the backend and then calls `setAccessToken`; it does not duplicate form rendering or routing decisions.

## 7. Forms and validation

The project uses two complementary approaches:

- simple authentication screens use controlled `useState` fields;
- project/suite forms use React Hook Form and Zod.

Example schema:

```ts
const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  targetOrigin: z.string().url(),
})
```

`z.infer<typeof projectSchema>` derives the TypeScript form type from the schema, avoiding a second manually maintained interface.

The form submits only after the resolver succeeds:

```tsx
<form onSubmit={form.handleSubmit(values => mutation.mutate(values))}>
```

Client validation improves feedback, but the server repeats validation because a browser can be bypassed and because the backend owns the target allowlist and authorization rules.

## 8. TanStack Query patterns

[`projects/api.ts`](../frontend/src/features/projects/api.ts) defines stable query keys:

```ts
export const projectKeys = {
  detail: (id: string) => ['projects', id] as const,
  suites: (id: string) => ['projects', id, 'suites'] as const,
  execution: (id: string, executionId: string) =>
    ['projects', id, 'executions', executionId] as const,
}
```

The `as const` assertion preserves tuple literals, which makes invalid keys harder to create.

A read query:

```tsx
const query = useQuery({
  queryKey: projectKeys.suites(projectId),
  queryFn: () => projectsApi.suites(projectId),
})
```

A write mutation:

```tsx
const mutation = useMutation({
  mutationFn: projectsApi.createSuite.bind(null, projectId),
  onSuccess: () => {
    form.reset()
    client.invalidateQueries({ queryKey: projectKeys.suites(projectId) })
  },
})
```

The mutation does not manually edit cached suite data. It invalidates the query, allowing the server to remain the source of truth.

## 9. Project UI data flow

The project pages follow a repeated structure:

```text
useParams()
  → project ID from URL
  → query key
  → projectsApi request
  → loading/error/data branch
  → render
```

For example, `ProjectsPage`:

1. reads the current user for the “New project” capability;
2. stores the search input locally;
3. queries `/api/v1/projects` with a URL-encoded `q` parameter;
4. renders a loading card, error card, empty state, or project grid.

`ProjectOverviewPage` renders server-returned permissions:

```tsx
project.permissions.includes('PROJECT_ARCHIVE')
```

This keeps the UI role-aware without reproducing the role matrix in every component. The backend still decides whether the archive request succeeds.

## 10. Test case editing

The current page structure is:

```text
ProjectsPage
  → ProjectOverviewPage
    → SuitesPage
      → SuitePage
        → NewCasePage / CasePage
```

`CasePage` builds the ordered `steps` array and sends the aggregate to the backend. The server replaces the existing step rows in one transaction. The frontend uses the `position` field as the canonical order.

Each step is represented by a TypeScript type with optional fields:

```ts
export type Step = {
  position: number
  action: string
  locatorType?: string
  locatorValue?: string
  inputValue?: string
  expectedValue?: string
  timeoutMs?: number
}
```

Optional fields match the fact that different actions need different data. For example, `CLICK` needs a locator, while `NAVIGATE` needs an input URL and `ASSERT_TEXT_CONTAINS` needs expected text.

## 11. Execution UI and polling

[`ExecutionPages.tsx`](../frontend/src/features/executions/ExecutionPages.tsx) uses polling rather than a WebSocket:

```tsx
const query = useQuery({
  queryKey: projectKeys.execution(projectId, executionId),
  queryFn: () => projectsApi.execution(projectId, executionId),
  refetchInterval: data =>
    data.state.data && terminal.has(data.state.data.status)
      ? false
      : 2000,
})
```

The important detail is that `refetchInterval` stops once the status is terminal. This prevents unnecessary requests after `PASSED`, `FAILED`, `ERROR`, or `CANCELLED`.

The detail page renders:

- execution progress counters;
- per-case statuses and attempt counts;
- per-step result rows;
- cancellation while the execution is active;
- artifact download actions.

Queue calls include a client-generated UUID in the `Idempotency-Key` header. The backend uses it to protect against duplicate submission retries.

## 12. System health feature

[`useSystemHealth`](../frontend/src/features/system-health/api.ts) is a small example of a feature built entirely around a query:

```tsx
const health = useQuery({
  queryKey: ['system-health'],
  queryFn: () => apiFetch<SystemHealth>('/actuator/health'),
})
```

`SystemHealthPanel` has explicit pending, error, healthy, and degraded render branches. This makes operational state visible on the home page without mixing health checks into authentication or project code.

## 13. Testing the frontend

[`SystemHealthPanel.test.tsx`](../frontend/src/features/system-health/SystemHealthPanel.test.tsx) demonstrates the test style:

1. Create a QueryClient with retries disabled.
2. Render the component inside `QueryClientProvider`.
3. Stub `fetch` with `vi.stubGlobal`.
4. Assert on accessible headings.
5. Restore stubs after each test.

The test checks behavior, not implementation details: “healthy response shows Backend ready” and “failed request shows Backend unavailable.”

The `frontend` scripts provide four quality gates:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

## 14. How to debug a frontend screen

For a missing or stale screen, inspect in this order:

1. Is the route in `router.tsx` and is it nested under the right layout?
2. Is `ProtectedRoute` redirecting because auth bootstrap has not completed?
3. Is the query key stable and using the correct IDs?
4. Is the API function using the correct path, method, body, and response type?
5. Did the request get a `401`, trigger refresh, and retry once?
6. Did the backend return `detail` or `message` that `ApiError` can display?
7. Does a mutation invalidate the query that renders the changed data?
8. Does the component have explicit pending, error, empty, and success states?

The browser devtools Network panel plus the backend route/controller is usually enough to locate the boundary where behavior diverges.
