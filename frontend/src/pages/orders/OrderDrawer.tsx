import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { Order } from '@/api/types'
import { useCan, useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useOrder } from '@/hooks/useSales'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime, formatMoney, formatOrderNumber } from '@/lib/format'
import { fromCents, toCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { InvoiceButton } from './InvoiceButton'
import { OrderStatusBadge } from './OrderStatusBadge'
import { RefundDialog } from './RefundDialog'

interface OrderDrawerProps {
  orderId: string | null
  onClose: () => void
}

export function OrderDrawer({ orderId, onClose }: OrderDrawerProps) {
  const order = useOrder(orderId ?? undefined)
  const { organization } = useSession()
  const canRefund = useCan('manager')
  const [refunding, setRefunding] = useState(false)
  const data = order.data

  return (
    <>
      <Dialog
        open={orderId !== null}
        onClose={onClose}
        variant="drawer"
        title={data ? formatOrderNumber(data.number) : 'Order'}
        description={data && formatDateTime(data.created_at, organization.timezone)}
        footer={
          data && (
            <>
              <InvoiceButton orderId={data.id} />
              {canRefund && data.status !== 'refunded' && (
                <Button variant="danger" onClick={() => setRefunding(true)}>
                  <RotateCcw /> Refund…
                </Button>
              )}
            </>
          )
        }
      >
        {order.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : order.isError ? (
          <Alert>{getErrorMessage(order.error)}</Alert>
        ) : (
          <OrderDetails order={order.data} />
        )}
      </Dialog>

      {data && <RefundDialog order={data} open={refunding} onClose={() => setRefunding(false)} />}
    </>
  )
}

function OrderDetails({ order }: { order: Order }) {
  const { organization } = useSession()
  const money = (value: string) => formatMoney(value, organization.currency)
  const refunded = toCents(order.refunded_amount) > 0

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-[13px]">
        <div>
          <dt className="text-xs text-muted">Status</dt>
          <dd className="mt-1">
            <OrderStatusBadge status={order.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Location</dt>
          <dd className="mt-1 font-medium text-foreground">{order.location_code}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Customer</dt>
          <dd className="mt-1 text-foreground">{order.customer_name ?? 'Walk-in'}</dd>
        </div>
        {order.refunded_at && (
          <div>
            <dt className="text-xs text-muted">Refunded</dt>
            <dd className="mt-1 text-foreground">
              {formatDateTime(order.refunded_at, organization.timezone)}
            </dd>
          </div>
        )}
      </dl>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">Total</TH>
            </TR>
          </THead>
          <TBody>
            {order.lines.map((line) => (
              <TR key={line.id}>
                <TD className="min-w-40">
                  <p className="font-medium text-foreground">{line.name}</p>
                  <p className="font-mono text-xs text-muted">{line.sku}</p>
                </TD>
                <TD className="text-right tabular-nums">
                  {line.quantity}
                  {line.refunded_quantity > 0 && (
                    <p className="text-xs whitespace-nowrap text-warning-ink">
                      −{line.refunded_quantity} refunded
                    </p>
                  )}
                </TD>
                <TD className="text-right tabular-nums">{money(line.unit_price)}</TD>
                <TD className="text-right font-medium tabular-nums">{money(line.line_total)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <dl className="ml-auto max-w-64 space-y-1.5 text-[13px] tabular-nums">
        <div className="flex justify-between text-muted">
          <dt>Subtotal</dt>
          <dd>{money(order.subtotal)}</dd>
        </div>
        {toCents(order.discount) > 0 && (
          <div className="flex justify-between text-muted">
            <dt>Discount</dt>
            <dd>−{money(order.discount)}</dd>
          </div>
        )}
        <div
          className={cn(
            'flex justify-between border-t pt-1.5 text-foreground',
            refunded ? 'font-medium' : 'text-base font-semibold',
          )}
        >
          <dt>Total</dt>
          <dd>{money(order.total)}</dd>
        </div>
        {refunded && (
          <>
            <div className="flex justify-between text-warning-ink">
              <dt>Refunded</dt>
              <dd>−{money(order.refunded_amount)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1.5 text-base font-semibold text-foreground">
              <dt>Net paid</dt>
              <dd>
                {formatMoney(
                  fromCents(toCents(order.total) - toCents(order.refunded_amount)),
                  organization.currency,
                )}
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  )
}
