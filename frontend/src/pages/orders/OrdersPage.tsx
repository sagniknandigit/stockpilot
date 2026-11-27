import { ReceiptText, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { OrderStatus } from '@/api/types'
import { useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useOrders } from '@/hooks/useSales'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime, formatMoney, formatOrderNumber, zonedDateToIso } from '@/lib/format'
import { OrderDrawer } from './OrderDrawer'
import { OrderStatusBadge } from './OrderStatusBadge'

const PAGE_SIZE = 20

export function OrdersPage() {
  const { organization } = useSession()
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  // The open order lives in the URL (?order=…) so the dashboard feed can deep-link to it.
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('order')
  const setSelectedId = (id: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (id) next.set('order', id)
        else next.delete('order')
        return next
      },
      { replace: true },
    )

  const orders = useOrders({
    page,
    size: PAGE_SIZE,
    status: status || undefined,
    // Date inputs are calendar days in the organization's time zone, like the reports.
    date_from: dateFrom ? zonedDateToIso(dateFrom, 'start', organization.timezone) : undefined,
    date_to: dateTo ? zonedDateToIso(dateTo, 'end', organization.timezone) : undefined,
  })
  const hasFilters = Boolean(status || dateFrom || dateTo)

  function filter(apply: () => void) {
    apply()
    setPage(1)
  }

  return (
    <>
      <PageHeader title="Orders" description="Every sale, with refunds handled in one click." />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Status</span>
            <Select
              value={status}
              onChange={(event) => filter(() => setStatus(event.target.value as OrderStatus | ''))}
              className="w-40"
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="partially_refunded">Partially refunded</option>
              <option value="refunded">Refunded</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">From</span>
            <Input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => filter(() => setDateFrom(event.target.value))}
              className="w-40"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">To</span>
            <Input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => filter(() => setDateTo(event.target.value))}
              className="w-40"
            />
          </label>
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() =>
                filter(() => {
                  setStatus('')
                  setDateFrom('')
                  setDateTo('')
                })
              }
            >
              <X /> Clear filters
            </Button>
          )}
        </div>

        {orders.isError ? (
          <Alert className="m-4">{getErrorMessage(orders.error)}</Alert>
        ) : orders.data?.total === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={hasFilters ? 'No orders match these filters' : 'No orders yet'}
            description={
              hasFilters
                ? 'Try widening the date range.'
                : 'Sales from the point of sale will show up here.'
            }
          />
        ) : (
          <>
            <Table scrollY>
              <THead>
                <TR>
                  <TH>Order</TH>
                  <TH>Date</TH>
                  <TH>Location</TH>
                  <TH className="text-right">Items</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {orders.isPending ? (
                  <TableSkeleton columns={6} />
                ) : (
                  orders.data.items.map((order) => (
                    <TR
                      key={order.id}
                      className="cursor-pointer hover:bg-subtle/60"
                      onClick={() => setSelectedId(order.id)}
                    >
                      <TD>
                        <button
                          type="button"
                          className="font-mono font-medium text-foreground hover:underline"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedId(order.id)
                          }}
                        >
                          {formatOrderNumber(order.number)}
                        </button>
                        {order.customer_name && (
                          <p className="text-xs text-muted">{order.customer_name}</p>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-muted">
                        {formatDateTime(order.created_at, organization.timezone)}
                      </TD>
                      <TD>
                        <Badge>{order.location_code}</Badge>
                      </TD>
                      <TD className="text-right tabular-nums">
                        {order.lines.reduce((sum, line) => sum + line.quantity, 0)}
                      </TD>
                      <TD className="text-right font-medium whitespace-nowrap tabular-nums">
                        {formatMoney(order.total, organization.currency)}
                        {order.status === 'partially_refunded' && (
                          <p className="text-xs font-normal text-muted">
                            −{formatMoney(order.refunded_amount, organization.currency)} refunded
                          </p>
                        )}
                      </TD>
                      <TD>
                        <OrderStatusBadge status={order.status} />
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
            {orders.data && (
              <Pagination
                page={page}
                size={PAGE_SIZE}
                total={orders.data.total}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>
      <OrderDrawer orderId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  )
}
