import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '@/api/reports'
import { queryKeys } from './queryKeys'

export function useSummary() {
  return useQuery({
    queryKey: queryKeys.reports.summary(),
    queryFn: reportsApi.summary,
    refetchInterval: 60_000,
  })
}
