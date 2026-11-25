import { CircleCheck, Printer, Plus } from 'lucide-react'
import type { Location, Order } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { formatDateTime, formatMoney, formatOrderNumber } from '@/lib/format'

interface ReceiptDialogProps {
  order: Order | null
  organizationName: string
  location: Location
  currency: string
  timeZone: string
  onNewSale: () => void
}

export function ReceiptDialog({
  order,
  organizationName,
  location,
  currency,
  timeZone,
  onNewSale,
}: ReceiptDialogProps) {
  return (
    <Dialog
      open={order !== null}
      onClose={onNewSale}
      title={
        <span className="flex items-center gap-2">
          <CircleCheck className="size-5 text-emerald-500" aria-hidden="true" /> Sale complete
        </span>
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button onClick={onNewSale} autoFocus>
            <Plus /> New sale
          </Button>
        </>
      }
    >
      {order && (
        <Receipt
          order={order}
          organizationName={organizationName}
          location={location}
          currency={currency}
          timeZone={timeZone}
        />
      )}
    </Dialog>
  )
}

/** Printable receipt: the print stylesheet in index.css prints only `.print-area`. */
function Receipt({
  order,
  organizationName,
  location,
  currency,
  timeZone,
}: {
  order: Order
  organizationName: string
  location: Location
  currency: string
  timeZone: string
}) {
  const money = (value: string) => formatMoney(value, currency)
  return (
    <div className="print-area font-mono text-[13px]">
      <div className="text-center">
        <p className="text-base font-semibold">{organizationName}</p>
        <p className="text-xs text-muted">
          {location.name}
          {location.address && ` · ${location.address}`}
        </p>
        <p className="mt-3 text-lg font-bold">{formatOrderNumber(order.number)}</p>
        <p className="text-xs text-muted">{formatDateTime(order.created_at, timeZone)}</p>
        {order.customer_name && <p className="mt-1 text-xs">Customer: {order.customer_name}</p>}
      </div>
      <div className="my-3 border-t border-dashed" />
      <ul className="space-y-2">
        {order.lines.map((line) => (
          <li key={line.id}>
            <div className="flex justify-between gap-3">
              <span className="min-w-0 break-words">{line.name}</span>
              <span className="shrink-0 tabular-nums">{money(line.line_total)}</span>
            </div>
            <p className="text-xs text-muted tabular-nums">
              {line.quantity} × {money(line.unit_price)} · {line.sku}
            </p>
          </li>
        ))}
      </ul>
      <div className="my-3 border-t border-dashed" />
      <dl className="space-y-1 tabular-nums">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{money(order.subtotal)}</dd>
        </div>
        {Number(order.discount) > 0 && (
          <div className="flex justify-between">
            <dt>Discount</dt>
            <dd>−{money(order.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between text-base font-bold">
          <dt>Total</dt>
          <dd>{money(order.total)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-center text-xs text-muted">Thank you for shopping with us!</p>
    </div>
  )
}
