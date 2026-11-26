import type { OrderStatus } from '@/api/types'
import { Badge } from '@/components/ui/Badge'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return status === 'completed' ? (
    <Badge tone="success" dot>
      Completed
    </Badge>
  ) : (
    <Badge tone="warning" dot>
      Refunded
    </Badge>
  )
}
