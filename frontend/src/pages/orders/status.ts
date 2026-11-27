import type { OrderStatus } from '@/api/types'
import type { BadgeTone } from '@/components/ui/Badge'

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  completed: { label: 'Completed', tone: 'success' },
  partially_refunded: { label: 'Partially refunded', tone: 'info' },
  refunded: { label: 'Refunded', tone: 'warning' },
}
