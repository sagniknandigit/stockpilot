import type { OrderStatus } from '@/api/types'
import { Badge } from '@/components/ui/Badge'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return status === 'completed' ? (
    <Badge tone="success">Completed</Badge>
  ) : (
    <Badge tone="warning">Refunded</Badge>
  )
}
