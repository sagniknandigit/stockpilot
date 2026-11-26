import { History } from 'lucide-react'
import { useState } from 'react'
import type { Location } from '@/api/types'
import { useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useMovements } from '@/hooks/useInventory'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { REASON_META } from './reasons'

const PAGE_SIZE = 25

const REFERENCE_LABELS: Record<string, string> = {
  sales_order: 'Sale',
  sales_order_refund: 'Refund',
  transfer: 'Transfer',
  adjustment: 'Manual',
}

export function MovementsTab({ locations }: { locations: Location[] }) {
  const [locationId, setLocationId] = useState('')
  const [page, setPage] = useState(1)
  const movements = useMovements({ page, size: PAGE_SIZE, location_id: locationId || undefined })
  const { organization } = useSession()

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <p className="mr-auto text-[13px] text-muted">
          Every stock change is an immutable ledger entry. Newest first.
        </p>
        <Select
          value={locationId}
          onChange={(event) => {
            setLocationId(event.target.value)
            setPage(1)
          }}
          aria-label="Filter by location"
          className="w-48"
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.code})
            </option>
          ))}
        </Select>
      </div>

      {movements.isError ? (
        <Alert className="m-4">{getErrorMessage(movements.error)}</Alert>
      ) : movements.data?.total === 0 ? (
        <EmptyState
          icon={History}
          title="No movements yet"
          description="Adjustments, sales, refunds and transfers will appear here."
        />
      ) : (
        <>
          <Table scrollY>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Item</TH>
                <TH>Location</TH>
                <TH className="text-right">Qty</TH>
                <TH>Reason</TH>
                <TH>Reference</TH>
              </TR>
            </THead>
            <TBody>
              {movements.isPending ? (
                <TableSkeleton columns={6} />
              ) : (
                movements.data.items.map((m) => {
                  const reason = REASON_META[m.reason]
                  return (
                    <TR key={m.id}>
                      <TD className="whitespace-nowrap text-muted">
                        {formatDateTime(m.created_at, organization.timezone)}
                      </TD>
                      <TD className="min-w-44">
                        <p className="font-medium text-foreground">{m.product_name}</p>
                        <p className="text-xs text-muted">
                          {m.variant_name} · <span className="font-mono">{m.sku}</span>
                        </p>
                      </TD>
                      <TD>
                        <Badge>{m.location_code}</Badge>
                      </TD>
                      <TD
                        className={cn(
                          'text-right font-semibold tabular-nums',
                          m.quantity > 0 ? 'text-success-ink' : 'text-danger-ink',
                        )}
                      >
                        {m.quantity > 0 ? '+' : '−'}
                        {formatNumber(Math.abs(m.quantity))}
                      </TD>
                      <TD>
                        <Badge tone={reason.tone}>{reason.label}</Badge>
                      </TD>
                      <TD className="max-w-64 text-muted">
                        <p className="truncate text-xs">
                          {m.reference_type
                            ? (REFERENCE_LABELS[m.reference_type] ?? m.reference_type)
                            : '—'}
                          {m.note && ` · ${m.note}`}
                        </p>
                      </TD>
                    </TR>
                  )
                })
              )}
            </TBody>
          </Table>
          {movements.data && (
            <Pagination
              page={page}
              size={PAGE_SIZE}
              total={movements.data.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </>
  )
}
