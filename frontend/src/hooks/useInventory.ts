import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { inventoryApi } from '@/api/inventory'
import type { MovementListParams, StockListParams } from '@/api/types'
import { queryKeys } from './queryKeys'

export function useLocations() {
  return useQuery({
    queryKey: queryKeys.inventory.locations(),
    queryFn: inventoryApi.listLocations,
    staleTime: 5 * 60_000,
  })
}

export function useCreateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: inventoryApi.createLocation,
    // New locations add rows to the stock grid, so refresh the whole domain.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
  })
}

export function useStock(params: StockListParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.inventory.stock(params),
    queryFn: () => inventoryApi.listStock(params),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useMovements(params: MovementListParams) {
  return useQuery({
    queryKey: queryKeys.inventory.movements(params),
    queryFn: () => inventoryApi.listMovements(params),
    placeholderData: keepPreviousData,
  })
}

export function useReconcile(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.inventory.reconcile(),
    queryFn: inventoryApi.reconcile,
    enabled,
    staleTime: 0,
  })
}

/** Stock changes affect stock rows, movements, POS availability and dashboard KPIs. */
function useInvalidateStock() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.insights.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.variantSearches() }),
    ])
}

export function useAdjustStock() {
  const invalidate = useInvalidateStock()
  return useMutation({ mutationFn: inventoryApi.adjust, onSuccess: invalidate })
}

export function useTransferStock() {
  const invalidate = useInvalidateStock()
  return useMutation({ mutationFn: inventoryApi.transfer, onSuccess: invalidate })
}
