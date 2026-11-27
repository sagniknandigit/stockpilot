import { ArrowRight, ReceiptText } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { useSession } from '@/auth/AuthContext'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useOrders } from '@/hooks/useSales'
import { formatMoney, formatOrderNumber, formatRelative, pluralize } from '@/lib/format'
import { fadeUp } from '@/lib/motion'
import { OrderStatusBadge } from '@/pages/orders/OrderStatusBadge'

export function RecentOrdersCard() {
  const { organization } = useSession()
  const orders = useOrders({ size: 6 })

  return (
    <motion.div variants={fadeUp} className="h-full min-w-0">
      <Card className="flex h-full flex-col">
        <CardHeader
          icon={<ReceiptText />}
          title="Recent orders"
          description="Latest sales across all locations"
          actions={
            <Link
              to="/orders"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
            >
              All orders <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        />
        {orders.isPending ? (
          <ul className="space-y-3 px-5 pt-1 pb-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </ul>
        ) : orders.data?.items.length === 0 ? (
          <EmptyState
            compact
            icon={ReceiptText}
            title="No orders yet"
            description="Sales from the point of sale appear here."
          />
        ) : (
          <ul className="divide-y px-2 pb-2">
            {orders.data?.items.map((order) => {
              const items = order.lines.reduce((sum, line) => sum + line.quantity, 0)
              return (
                <li key={order.id}>
                  <Link
                    to={`/orders?order=${order.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-subtle/70"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-subtle font-mono text-[11px] font-semibold text-muted">
                      {order.location_code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-foreground">
                        {formatOrderNumber(order.number)}
                        {order.customer_name && (
                          <span className="font-normal text-muted"> · {order.customer_name}</span>
                        )}
                      </span>
                      <span className="block text-xs text-muted">
                        {pluralize(items, 'item')} · {formatRelative(order.created_at)}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="text-[13px] font-semibold text-foreground">
                        {formatMoney(order.total, organization.currency)}
                      </span>
                      {order.status !== 'completed' && <OrderStatusBadge status={order.status} />}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </motion.div>
  )
}
