import { api, apiRequest } from './client'
import type { Order, OrderInput, OrderListParams, Page, UUID } from './types'

export interface CreateOrderResult {
  order: Order
  /** True when the server returned the order originally created with this idempotency key. */
  replayed: boolean
}

export const salesApi = {
  /**
   * Checkout. The idempotency key makes retries safe: re-sending the same key and body after
   * a network failure returns the original order instead of selling the stock twice.
   */
  createOrder: async (input: OrderInput, idempotencyKey: string): Promise<CreateOrderResult> => {
    const response = await apiRequest<Order>('/sales/orders', {
      method: 'POST',
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return {
      order: response.data,
      replayed: response.headers.get('Idempotent-Replayed') === 'true',
    }
  },
  listOrders: (params: OrderListParams) => api.get<Page<Order>>('/sales/orders', params),
  getOrder: (id: UUID) => api.get<Order>(`/sales/orders/${id}`),
  refundOrder: (id: UUID) => api.post<Order>(`/sales/orders/${id}/refund`),
}
