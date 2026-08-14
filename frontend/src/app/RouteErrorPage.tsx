import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

import { applicationRevision, isChunkLoadError } from './lazyWithRecovery'

function describeRouteError(error: unknown) {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) return 'That page does not exist or is no longer available.'
    return 'The application could not load this route.'
  }
  if (isChunkLoadError(error)) {
    return 'This tab may be using an older application bundle. Reload once to get the latest version.'
  }
  return 'Something unexpected interrupted the page. Your saved project data is safe; try again or return to readiness.'
}

export function RouteErrorPage() {
  const error = useRouteError()
  const revision = applicationRevision === 'development' ? undefined : applicationRevision
  return (
    <main className="route-error-page" aria-labelledby="route-error-title">
      <section className="card route-error-card">
        <p className="eyebrow">TestOps recovery</p>
        <h1 id="route-error-title">We couldn’t load this page</h1>
        <p>{describeRouteError(error)}</p>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => window.location.reload()}>Reload application</button>
          <Link className="button button-secondary" to="/">Return to readiness</Link>
        </div>
        {revision && <p className="route-error-revision">Build revision: <code>{revision}</code></p>}
      </section>
    </main>
  )
}
