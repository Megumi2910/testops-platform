export const DASHBOARD_RANGES = [7, 30, 90] as const
export type DashboardRange = typeof DASHBOARD_RANGES[number]
export type DashboardWindow = { from: string; to: string; selection: string }

function validDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function dashboardWindow(search: URLSearchParams, now = new Date()): DashboardWindow {
  const explicitFrom = validDate(search.get('from'))
  const explicitTo = validDate(search.get('to'))
  if (explicitFrom && explicitTo && explicitTo > explicitFrom && explicitTo.getTime() - explicitFrom.getTime() <= 366 * 24 * 60 * 60 * 1000) {
    return { from: explicitFrom.toISOString(), to: explicitTo.toISOString(), selection: 'custom' }
  }
  const parsed = Number(search.get('range'))
  const days: DashboardRange = DASHBOARD_RANGES.includes(parsed as DashboardRange) ? parsed as DashboardRange : 30
  const end = new Date(now)
  const start = new Date(end)
  start.setUTCDate(end.getUTCDate() - days)
  return { from: start.toISOString(), to: end.toISOString(), selection: String(days) }
}
