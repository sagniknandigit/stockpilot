import type { UUID } from '@/api/types'

/** Messages pushed by the server on /api/v1/ws. */
export type RealtimeEvent =
  | { type: 'ready' }
  | { type: 'ping' }
  | { type: 'resync' }
  | {
      type: 'stock.changed'
      variant_id: UUID
      location_id: UUID
      on_hand: number
      available: number
      delta: number
    }
  | { type: 'order.created'; order_id: UUID; number: number; total: string; location_id: UUID }
  | { type: 'po.received'; po_id: UUID; number: number; status: string }

export type RealtimeStatus = 'connecting' | 'live' | 'reconnecting' | 'offline'

/**
 * Orders created by *this* tab, so the "New sale" toast only fires for sales made elsewhere.
 * The event can arrive before the HTTP response, so callers check after a short delay.
 */
const localOrders = new Set<UUID>()

export function rememberLocalOrder(id: UUID): void {
  localOrders.add(id)
}

export function isLocalOrder(id: UUID): boolean {
  return localOrders.has(id)
}
