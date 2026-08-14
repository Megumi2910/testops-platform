import { Suspense, type ReactNode } from 'react'

export function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="card loading-state" role="status">Loading page…</div>}>{children}</Suspense>
}
