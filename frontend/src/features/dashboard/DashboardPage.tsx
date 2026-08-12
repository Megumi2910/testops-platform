import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { dashboardApi } from './api'
import { dashboardWindow } from './dashboardWindow'
import { Alert, Card, EmptyState, LoadingState, PageHeader, StatusBadge } from '../../components/ui'

export function DashboardPage() {
  const [search, setSearch] = useSearchParams()
  const { from, to, selection } = useMemo(() => dashboardWindow(search), [search])
  const summary = useQuery({ queryKey: ['dashboard', 'summary', from, to], queryFn: () => dashboardApi.summary(from, to) })
  const recent = useQuery({ queryKey: ['dashboard', 'recent', from, to], queryFn: () => dashboardApi.recent(from, to) })
  const infra = useQuery({ queryKey: ['dashboard', 'infra', from, to], queryFn: () => dashboardApi.infrastructure(from, to) })
  const formatNumber = new Intl.NumberFormat(undefined)
  const formatPercent = (value: number) => `${Math.round(value * 100)}%`
  const setRange = (value: string) => {
    const next = new URLSearchParams(search)
    next.delete('from')
    next.delete('to')
    next.set('range', value)
    setSearch(next, { replace: true })
  }
  const isLoading = summary.isPending || recent.isPending || infra.isPending
  return <section className="page-stack" aria-busy={isLoading}>
    <PageHeader eyebrow="Reporting" title="Execution dashboard" description="A UTC view across projects you can access." actions={<label className="dashboard-filter" htmlFor="dashboard-range">Reporting period<select id="dashboard-range" name="range" aria-label="Reporting period" value={selection} onChange={event => setRange(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>{selection === 'custom' && <option value="custom">Custom URL range</option>}</select></label>} />
    <p className="form-help" aria-live="polite">Showing {new Date(from).toLocaleDateString()} – {new Date(to).toLocaleDateString()} (UTC)</p>
    {summary.isError && <Alert tone="danger" title="Reporting is unavailable.">Try again to refresh the dashboard. <button className="inline-link" type="button" onClick={() => void summary.refetch()}>Retry</button></Alert>}
    <div className="metric-grid" aria-label="Dashboard metrics">
      <Card>{summary.isPending ? <LoadingState label="Loading pass rate…" /> : summary.data ? <><p className="eyebrow">Functional pass rate</p><p className="metric-value">{formatPercent(summary.data.functionalPassRate)}</p><p className="muted">{formatNumber.format(summary.data.passedCases)} passed · {formatNumber.format(summary.data.failedCases)} failed</p></> : <p className="muted">Pass-rate data is unavailable.</p>}</Card>
      <Card>{summary.isPending ? <LoadingState label="Loading infrastructure rate…" /> : summary.data ? <><p className="eyebrow">Infrastructure error rate</p><p className="metric-value">{formatPercent(summary.data.infrastructureErrorRate)}</p><p className="muted">{formatNumber.format(summary.data.infrastructureErrors)} infrastructure errors</p></> : <p className="muted">Infrastructure-rate data is unavailable.</p>}</Card>
      <Card>{summary.isPending ? <LoadingState label="Loading execution count…" /> : summary.data ? <><p className="eyebrow">Executions</p><p className="metric-value">{formatNumber.format(summary.data.totalExecutions)}</p><p className="muted">Cancelled runs are excluded from rates.</p></> : <p className="muted">Execution data is unavailable.</p>}</Card>
    </div>
    <div className="dashboard-grid"><Card><div className="section-heading"><div><p className="eyebrow">Attention needed</p><h2>Recent failures</h2></div>{recent.data?.length ? <StatusBadge status="danger">{recent.data.length} open</StatusBadge> : <StatusBadge status="success">Clear</StatusBadge>}</div>{recent.isPending ? <LoadingState label="Loading failures…" /> : recent.data?.length ? <ul className="resource-list">{recent.data.map(item => <li key={`${item.executionId}-${item.caseId}`}><span className="min-w-0"><strong>{item.caseName}</strong><span className="muted"> · {item.category ?? 'FAILED'}</span><br /><span className="muted line-clamp">{item.message ?? 'No failure message recorded'}</span></span><Link className="button button-ghost button-small" to={`/projects/${item.projectId}/executions/${item.executionId}`}>Open run</Link></li>)}</ul> : <EmptyState title="No failures" description="No failed executions were recorded in this period." />}</Card><Card><div className="section-heading"><div><p className="eyebrow">Reliability</p><h2>Infrastructure categories</h2></div></div>{infra.isPending ? <LoadingState label="Loading categories…" /> : infra.data?.length ? <ul className="resource-list">{infra.data.map(item => <li key={item.category}><span>{item.category}</span><strong className="tabular-nums">{formatNumber.format(item.count)}</strong></li>)}</ul> : <EmptyState title="No infrastructure errors" description="Your recent runs have not reported infrastructure failures." />}</Card></div>
  </section>
}
