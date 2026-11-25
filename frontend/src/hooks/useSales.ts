import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { salesApi } from '@/api/sales'
import type { OrderInput, OrderListParams, UUID } from '@/api/types'
import { queryKeys } from './queryKeys'

export function useOrders(params: OrderListParams) {
  return useQuery({
    queryKey: queryKeys.sales.orders(params),
    queryFn: () => salesApi.listOrders(params),
    placeholderData: keepPreviousData,
  })
}

export function useOrder(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.order(id ?? ''),
    queryFn: () => salesApi.getOrder(id!),
    enabled: Boolean(id),
  })
}

/** Orders move stock and revenue, so refresh sales, inventory, POS search and reports. */
function useInvalidateAfterSale() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.variantSearches() }),
    ])
}

export function useCreateOrder() {
  const invalidate = useInvalidateAfterSale()
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: OrderInput; idempotencyKey: string }) =>
      salesApi.createOrder(input, idempotencyKey),
    onSuccess: invalidate,
    // The POS page renders checkout errors inline (e.g. highlighting short lines).
    meta: { silentError: true },
  })
}

export function useRefundOrder() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAfterSale()
  return useMutation({
    mutationFn: salesApi.refundOrder,
    onSuccess: (order) => {
      queryClient.setQueryData(queryKeys.sales.order(order.id), order)
      return invalidate()
    },
  })
}
