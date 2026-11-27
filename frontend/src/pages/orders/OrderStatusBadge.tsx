import type { OrderStatus } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { ORDER_STATUS } from './status'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS[status]
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  )
}
