import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { Order } from '@/api/types'
import { useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/toast'
import { useRefundOrder } from '@/hooks/useSales'
import { getErrorMessage, isApiError } from '@/lib/errors'
import { formatMoney, formatOrderNumber } from '@/lib/format'
import { fromCents, toCents } from '@/lib/money'

interface RefundDialogProps {
  order: Order
  open: boolean
  onClose: () => void
}

export function RefundDialog({ order, open, onClose }: RefundDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`Refund ${formatOrderNumber(order.number)}`}
      description="Choose what is coming back. Refunded items are returned to stock at the original location."
    >
      <RefundForm order={order} onDone={onClose} />
    </Dialog>
  )
}

interface LineProblem {
  line_id?: string
  requested?: number
  refundable?: number
  error?: string
}

function RefundForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const { organization } = useSession()
  const refund = useRefundOrder()
  const refundable = Object.fromEntries(
    order.lines.map((l) => [l.id, l.quantity - l.refunded_quantity]),
  )
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(order.lines.map((l) => [l.id, 0])),
  )
  const [reason, setReason] = useState('')
  const money = (cents: number) => formatMoney(fromCents(cents), organization.currency)

  const selected = order.lines.filter((l) => quantities[l.id] > 0)
  const units = selected.reduce((sum, l) => sum + quantities[l.id], 0)
  const refundsEverything = order.lines.every((l) => quantities[l.id] === refundable[l.id])
  // Estimate: line value scaled by the order's discount ratio, capped at what's left to refund.
  // The server computes the final figure (and returns exactly the remainder on the last refund).
  const outstandingCents = toCents(order.total) - toCents(order.refunded_amount)
  const grossCents = selected.reduce((sum, l) => sum + toCents(l.unit_price) * quantities[l.id], 0)
  const subtotalCents = toCents(order.subtotal)
  const estimateCents = refundsEverything
    ? outstandingCents
    : Math.min(
        subtotalCents ? Math.round((grossCents * toCents(order.total)) / subtotalCents) : 0,
        outstandingCents,
      )

  const problems: LineProblem[] =
    isApiError(refund.error, 'validation_error') || isApiError(refund.error, 'unprocessable')
      ? Array.isArray(refund.error.details)
        ? (refund.error.details as LineProblem[])
        : []
      : []
  const problemFor = (lineId: string) => problems.find((p) => p.line_id === lineId)

  function setQty(lineId: string, value: number) {
    refund.reset()
    setQuantities((q) => ({ ...q, [lineId]: Math.max(0, Math.min(value, refundable[lineId])) }))
  }

  function submit() {
    if (units === 0) return
    refund.mutate(
      {
        id: order.id,
        input: refundsEverything
          ? { reason: reason.trim() || null }
          : {
              lines: selected.map((l) => ({ line_id: l.id, quantity: quantities[l.id] })),
              reason: reason.trim() || null,
            },
      },
      {
        onSuccess: (updated) => {
          toast.success(
            updated.status === 'refunded'
              ? `${formatOrderNumber(updated.number)} fully refunded`
              : 'Partial refund recorded',
            `${units} ${units === 1 ? 'item' : 'items'} returned to stock`,
          )
          onDone()
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">
          {money(outstandingCents)} of {money(toCents(order.total))} still refundable
        </p>
        <Button
          variant="soft"
          size="sm"
          onClick={() => {
            refund.reset()
            setQuantities({ ...refundable })
          }}
        >
          <RotateCcw /> Refund all remaining
        </Button>
      </div>

      <ul className="divide-y rounded-xl border">
        {order.lines.map((line) => {
          const max = refundable[line.id]
          const problem = problemFor(line.id)
          return (
            <li key={line.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{line.name}</p>
                <p className="text-xs text-muted">
                  {formatMoney(line.unit_price, organization.currency)} each · {line.quantity} sold
                  {line.refunded_quantity > 0 && ` · ${line.refunded_quantity} already refunded`}
                </p>
                {problem && (
                  <p className="mt-0.5 text-xs text-danger-ink" role="alert">
                    {problem.refundable !== undefined
                      ? `Only ${problem.refundable} can be refunded`
                      : problem.error}
                  </p>
                )}
              </div>
              {max === 0 ? (
                <span className="text-xs text-muted">Fully refunded</span>
              ) : (
                <div
                  className="flex items-center rounded-xl border bg-surface"
                  role="group"
                  aria-label={`Refund quantity of ${line.sku}`}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-r-none"
                    onClick={() => setQty(line.id, quantities[line.id] - 1)}
                    disabled={quantities[line.id] === 0}
                    aria-label={`Fewer ${line.sku}`}
                  >
                    <Minus />
                  </Button>
                  <span className="w-14 text-center text-sm font-semibold" aria-live="polite">
                    {quantities[line.id]} <span className="font-normal text-muted">/ {max}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-l-none"
                    onClick={() => setQty(line.id, quantities[line.id] + 1)}
                    disabled={quantities[line.id] >= max}
                    aria-label={`More ${line.sku}`}
                  >
                    <Plus />
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <Input
        value={reason}
        maxLength={200}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (optional), e.g. damaged packaging"
        aria-label="Refund reason"
      />

      {refund.isError && problems.length === 0 && <Alert>{getErrorMessage(refund.error)}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div>
          <p className="text-xs text-muted">Estimated refund</p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {money(estimateCents)}
          </p>
          {toCents(order.discount) > 0 && (
            <p className="text-xs text-muted">Discount applied proportionally.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={refund.isPending}
            disabled={units === 0}
          >
            Refund {units > 0 ? `${units} ${units === 1 ? 'item' : 'items'}` : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
