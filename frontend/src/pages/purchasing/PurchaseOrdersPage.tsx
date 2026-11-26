import { Plus, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { PurchaseOrderStatus } from '@/api/types'
import { useCan, useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Select } from '@/components/ui/Select'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { usePurchaseOrders, useSuppliers } from '@/hooks/usePurchasing'
import { getErrorMessage } from '@/lib/errors'
import { formatCalendarDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PurchasingTabs } from './PurchasingTabs'
import { formatPoNumber, PO_STATUS } from './status'

const PAGE_SIZE = 20
const STATUSES = Object.keys(PO_STATUS) as PurchaseOrderStatus[]

export function PurchaseOrdersPage() {
  const { organization } = useSession()
  const canManage = useCan('manager')
  const navigate = useNavigate()
  const [status, setStatus] = useState<PurchaseOrderStatus | ''>('')
  const [params] = useSearchParams()
  const [supplierId, setSupplierId] = useState(() => params.get('supplier') ?? '')
  const [page, setPage] = useState(1)
  const suppliers = useSuppliers(true)
  const orders = usePurchaseOrders({
    page,
    size: PAGE_SIZE,
    status: status || undefined,
    supplier_id: supplierId || undefined,
  })
  const filtered = Boolean(status || supplierId)

  return (
    <>
      <PageHeader
        title="Purchasing"
        description="Order stock from suppliers and receive it into inventory."
        actions={
          canManage && (
            <ButtonLink to="/purchasing/new">
              <Plus /> New purchase order
            </ButtonLink>
          )
        }
      />
      <PurchasingTabs />
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div
            role="radiogroup"
            aria-label="Status"
            className="flex flex-1 gap-1.5 overflow-x-auto"
          >
            {(['', ...STATUSES] as const).map((value) => (
              <button
                key={value || 'all'}
                type="button"
                role="radio"
                aria-checked={status === value}
                onClick={() => {
                  setStatus(value)
                  setPage(1)
                }}
                className={cn(
                  'h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition-colors',
                  status === value
                    ? 'border-transparent bg-foreground text-background'
                    : 'bg-surface text-muted hover:text-foreground',
                )}
              >
                {value ? PO_STATUS[value].label : 'All'}
              </button>
            ))}
          </div>
          <Select
            value={supplierId}
            onChange={(event) => {
              setSupplierId(event.target.value)
              setPage(1)
            }}
            aria-label="Filter by supplier"
            className="w-52"
          >
            <option value="">All suppliers</option>
            {suppliers.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        {orders.isError ? (
          <Alert className="m-4">{getErrorMessage(orders.error)}</Alert>
        ) : orders.data?.total === 0 ? (
          <EmptyState
            title={filtered ? 'No purchase orders match' : 'No purchase orders yet'}
            description={
              filtered
                ? 'Try another status or supplier.'
                : 'Create one, or let the reorder planner draft it for you.'
            }
            icon={Truck}
            action={
              canManage &&
              !filtered && (
                <ButtonLink to="/purchasing/new">
                  <Plus /> New purchase order
                </ButtonLink>
              )
            }
          />
        ) : (
          <>
            <Table scrollY>
              <THead>
                <TR>
                  <TH>Order</TH>
                  <TH>Supplier</TH>
                  <TH>Status</TH>
                  <TH>Received</TH>
                  <TH>Expected</TH>
                  <TH className="text-right">Total cost</TH>
                </TR>
              </THead>
              <TBody>
                {orders.isPending ? (
                  <TableSkeleton columns={6} />
                ) : (
                  orders.data.items.map((po) => {
                    const ordered = po.lines.reduce((sum, l) => sum + l.quantity_ordered, 0)
                    const received = po.lines.reduce((sum, l) => sum + l.quantity_received, 0)
                    return (
                      <TR
                        key={po.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/purchasing/orders/${po.id}`)}
                      >
                        <TD>
                          <Link
                            to={`/purchasing/orders/${po.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="font-mono font-semibold text-foreground hover:underline"
                          >
                            {formatPoNumber(po.number)}
                          </Link>
                          <p className="text-xs text-muted">{po.location_code}</p>
                        </TD>
                        <TD className="min-w-44">
                          <p className="font-medium text-foreground">{po.supplier_name}</p>
                          {po.notes && (
                            <p className="max-w-56 truncate text-xs text-muted">{po.notes}</p>
                          )}
                        </TD>
                        <TD>
                          <Badge tone={PO_STATUS[po.status].tone} dot>
                            {PO_STATUS[po.status].label}
                          </Badge>
                        </TD>
                        <TD className="min-w-36">
                          <p className="mb-1 text-xs text-muted">
                            {received} / {ordered} units
                          </p>
                          <ProgressBar
                            value={received}
                            max={ordered}
                            label={`${formatPoNumber(po.number)} received`}
                            tone={received >= ordered && ordered > 0 ? 'success' : 'brand'}
                          />
                        </TD>
                        <TD className="whitespace-nowrap text-muted">
                          {po.expected_at ? formatCalendarDate(po.expected_at) : '—'}
                        </TD>
                        <TD className="text-right font-medium whitespace-nowrap">
                          {formatMoney(po.total_cost, organization.currency)}
                        </TD>
                      </TR>
                    )
                  })
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
    </>
  )
}
