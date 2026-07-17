import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '../../lib/api'

export interface SystemHealth {
  status: string
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: () => apiFetch<SystemHealth>('/actuator/health'),
  })
}
