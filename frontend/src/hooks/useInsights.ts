import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { insightsApi } from '@/api/insights'
import type { UUID } from '@/api/types'
import { queryKeys } from './queryKeys'

export function useReorderSuggestions(onlyNeeded = true) {
  return useQuery({
    queryKey: queryKeys.insights.reorder(onlyNeeded),
    queryFn: () => insightsApi.reorderSuggestions(onlyNeeded),
    staleTime: 60_000,
  })
}

export function useForecast(variantId: UUID | null) {
  return useQuery({
    queryKey: queryKeys.insights.forecast(variantId ?? ''),
    queryFn: () => insightsApi.forecast(variantId!),
    enabled: Boolean(variantId),
    staleTime: 5 * 60_000,
  })
}

export function useAnalytics(dateFrom: string, dateTo: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.insights.analytics(dateFrom, dateTo),
    queryFn: () => insightsApi.analytics(dateFrom, dateTo),
    placeholderData: keepPreviousData,
    enabled,
  })
}
