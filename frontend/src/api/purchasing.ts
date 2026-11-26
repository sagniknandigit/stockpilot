import { api } from './client'
import type {
  FromSuggestionsInput,
  Page,
  PurchaseOrder,
  PurchaseOrderInput,
  PurchaseOrderListParams,
  PurchaseOrderUpdateInput,
  ReceiveInput,
  Supplier,
  SupplierInput,
  SupplierUpdateInput,
  UUID,
} from './types'

export const purchasingApi = {
  listSuppliers: (includeInactive = false) =>
    api.get<Supplier[]>('/purchasing/suppliers', {
      include_inactive: includeInactive || undefined,
    }),
  createSupplier: (input: SupplierInput) => api.post<Supplier>('/purchasing/suppliers', input),
  updateSupplier: (id: UUID, input: SupplierUpdateInput) =>
    api.patch<Supplier>(`/purchasing/suppliers/${id}`, input),

  listOrders: (params: PurchaseOrderListParams) =>
    api.get<Page<PurchaseOrder>>('/purchasing/orders', params),
  getOrder: (id: UUID) => api.get<PurchaseOrder>(`/purchasing/orders/${id}`),
  createOrder: (input: PurchaseOrderInput) => api.post<PurchaseOrder>('/purchasing/orders', input),
  createFromSuggestions: (input: FromSuggestionsInput) =>
    api.post<PurchaseOrder>('/purchasing/orders/from-suggestions', input),
  /** Drafts only; `lines`, if given, replaces all lines. */
  updateOrder: (id: UUID, input: PurchaseOrderUpdateInput) =>
    api.patch<PurchaseOrder>(`/purchasing/orders/${id}`, input),
  submitOrder: (id: UUID) => api.post<PurchaseOrder>(`/purchasing/orders/${id}/submit`),
  cancelOrder: (id: UUID) => api.post<PurchaseOrder>(`/purchasing/orders/${id}/cancel`),
  receiveOrder: (id: UUID, input: ReceiveInput) =>
    api.post<PurchaseOrder>(`/purchasing/orders/${id}/receive`, input),
}
