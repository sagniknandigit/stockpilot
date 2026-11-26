import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { purchasingApi } from '@/api/purchasing'
import type {
  PurchaseOrder,
  PurchaseOrderInput,
  PurchaseOrderListParams,
  PurchaseOrderUpdateInput,
  ReceiveInput,
  SupplierInput,
  SupplierUpdateInput,
  UUID,
} from '@/api/types'
import { queryKeys } from './queryKeys'

export function useSuppliers(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.purchasing.suppliers(includeInactive),
    queryFn: () => purchasingApi.listSuppliers(includeInactive),
    staleTime: 60_000,
  })
}

export function useCreateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SupplierInput) => purchasingApi.createSupplier(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...queryKeys.purchasing.all, 'suppliers'] }),
  })
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: UUID; input: SupplierUpdateInput }) =>
      purchasingApi.updateSupplier(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.purchasing.all }),
  })
}

export function usePurchaseOrders(params: PurchaseOrderListParams) {
  return useQuery({
    queryKey: queryKeys.purchasing.orders(params),
    queryFn: () => purchasingApi.listOrders(params),
    placeholderData: keepPreviousData,
  })
}

export function usePurchaseOrder(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.purchasing.order(id ?? ''),
    queryFn: () => purchasingApi.getOrder(id!),
    enabled: Boolean(id),
  })
}

/**
 * Purchase orders change "on order" quantities (reorder suggestions) and, when received,
 * stock levels, costs and the dashboard — so writes refresh all of those.
 */
function useOnPurchaseOrderChanged() {
  const queryClient = useQueryClient()
  return (order: PurchaseOrder) => {
    queryClient.setQueryData(queryKeys.purchasing.order(order.id), order)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.purchasing.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.insights.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
    ])
  }
}

export function useCreatePurchaseOrder() {
  const onChanged = useOnPurchaseOrderChanged()
  return useMutation({
    mutationFn: (input: PurchaseOrderInput) => purchasingApi.createOrder(input),
    onSuccess: onChanged,
  })
}

export function useCreatePurchaseOrderFromSuggestions() {
  const onChanged = useOnPurchaseOrderChanged()
  return useMutation({ mutationFn: purchasingApi.createFromSuggestions, onSuccess: onChanged })
}

export function useUpdatePurchaseOrder(id: UUID) {
  const onChanged = useOnPurchaseOrderChanged()
  return useMutation({
    mutationFn: (input: PurchaseOrderUpdateInput) => purchasingApi.updateOrder(id, input),
    onSuccess: onChanged,
  })
}

export function usePurchaseOrderAction(id: UUID) {
  const onChanged = useOnPurchaseOrderChanged()
  return {
    submit: useMutation({ mutationFn: () => purchasingApi.submitOrder(id), onSuccess: onChanged }),
    cancel: useMutation({ mutationFn: () => purchasingApi.cancelOrder(id), onSuccess: onChanged }),
    receive: useMutation({
      mutationFn: (input: ReceiveInput) => purchasingApi.receiveOrder(id, input),
      onSuccess: onChanged,
    }),
  }
}
