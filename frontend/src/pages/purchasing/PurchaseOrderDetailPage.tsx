import {
  ArrowLeft,
  Ban,
  CalendarClock,
  MapPin,
  PackageCheck,
  Pencil,
  Send,
  Truck,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { PurchaseOrder } from '@/api/types'
import { useCan, useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageLoader } from '@/components/ui/PageLoader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { toast } from '@/components/ui/toast'
import { usePurchaseOrder, usePurchaseOrderAction } from '@/hooks/usePurchasing'
import { getErrorMessage } from '@/lib/errors'
import { formatCalendarDate, formatMoney } from '@/lib/format'
import { ReceiveDialog } from './ReceiveDialog'
import { formatPoNumber, PO_STATUS } from './status'
import { StatusStepper } from './StatusStepper'

export function PurchaseOrderDetailPage() {
  const { poId } = useParams<{ poId: string }>()
  const order = usePurchaseOrder(poId)
  if (order.isPending) return <PageLoader />
  if (order.isError) return <Alert>{getErrorMessage(order.error)}</Alert>
  return <PurchaseOrderDetail order={order.data} />
}

function PurchaseOrderDetail({ order }: { order: PurchaseOrder }) {
  const { organization } = useSession()
  const canManage = useCan('manager')
  const actions = usePurchaseOrderAction(order.id)
  const [receiving, setReceiving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const money = (value: string) => formatMoney(value, organization.currency)
  const received = order.lines.reduce((sum, l) => sum + l.quantity_received, 0)
  const ordered = order.lines.reduce((sum, l) => sum + l.quantity_ordered, 0)
  const canCancel = order.status === 'draft' || (order.status === 'ordered' && received === 0)
  const canReceive = order.status === 'ordered' || order.status === 'partially_received'

  return (
    <>
      <Link
        to="/purchasing"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Purchase orders
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">
              {formatPoNumber(order.number)}
            </h1>
            <Badge tone={PO_STATUS[order.status].tone} dot>
              {PO_STATUS[order.status].label}
            </Badge>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Truck className="size-3.5" aria-hidden="true" /> {order.supplier_name}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" /> {order.location_code}
            </span>
            {order.expected_at && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-3.5" aria-hidden="true" /> Expected{' '}
                {formatCalendarDate(order.expected_at)}
              </span>
            )}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {canCancel && (
              <Button
                variant="ghost"
                className="text-danger-ink"
                onClick={() => setCancelling(true)}
              >
                <Ban /> Cancel order
              </Button>
            )}
            {order.status === 'draft' && (
              <>
                <ButtonLink to={`/purchasing/orders/${order.id}/edit`} variant="secondary">
                  <Pencil /> Edit
                </ButtonLink>
                <Button
                  loading={actions.submit.isPending}
                  onClick={() =>
                    actions.submit.mutate(undefined, {
                      onSuccess: (po) =>
                        toast.success(`${formatPoNumber(po.number)} sent to ${po.supplier_name}`),
                    })
                  }
                >
                  <Send /> Submit order
                </Button>
              </>
            )}
            {canReceive && (
              <Button onClick={() => setReceiving(true)}>
                <PackageCheck /> Receive delivery
              </Button>
            )}
          </div>
        )}
      </div>

      <Card className="mb-6 p-5">
        <StatusStepper order={order} timeZone={organization.timezone} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader title="Lines" description={`${received} of ${ordered} units received`} />
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH className="min-w-40">Received</TH>
                <TH className="text-right">Unit cost</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {order.lines.map((line) => (
                <TR key={line.id}>
                  <TD className="min-w-44">
                    <p className="font-medium text-foreground">{line.name}</p>
                    <p className="font-mono text-xs text-muted">{line.sku}</p>
                  </TD>
                  <TD>
                    <p className="mb-1 text-xs text-muted">
                      <span className="font-semibold text-foreground">
                        {line.quantity_received}
                      </span>{' '}
                      / {line.quantity_ordered}
                      {line.quantity_outstanding > 0 &&
                        order.status !== 'draft' &&
                        order.status !== 'cancelled' && (
                          <span> · {line.quantity_outstanding} to come</span>
                        )}
                    </p>
                    <ProgressBar
                      value={line.quantity_received}
                      max={line.quantity_ordered}
                      label={`${line.sku} received`}
                      tone={line.quantity_outstanding === 0 ? 'success' : 'brand'}
                    />
                  </TD>
                  <TD className="text-right whitespace-nowrap">{money(line.unit_cost)}</TD>
                  <TD className="text-right font-medium whitespace-nowrap">
                    {money(line.line_total)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-[13px] text-muted">Order total</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              {money(order.total_cost)}
            </p>
            <div className="mt-4">
              <ProgressBar
                value={received}
                max={ordered}
                label="Units received"
                tone={received >= ordered ? 'success' : 'brand'}
              />
              <p className="mt-1.5 text-xs text-muted">
                {Math.round((received / Math.max(ordered, 1)) * 100)}% received
              </p>
            </div>
          </Card>
          {order.notes && (
            <Card className="p-5">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Notes</p>
              <p className="mt-1.5 text-[13px] whitespace-pre-line text-foreground">
                {order.notes}
              </p>
            </Card>
          )}
        </div>
      </div>

      {canReceive && (
        <ReceiveDialog order={order} open={receiving} onClose={() => setReceiving(false)} />
      )}
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel ${formatPoNumber(order.number)}?`}
        description="The supplier order is voided. This can’t be undone."
        confirmLabel="Cancel order"
        destructive
        loading={actions.cancel.isPending}
        onConfirm={() =>
          actions.cancel.mutate(undefined, {
            onSuccess: (po) => {
              toast.success(`${formatPoNumber(po.number)} cancelled`)
              setCancelling(false)
            },
          })
        }
      />
    </>
  )
}
