import { ArrowLeftRight, Boxes, Search, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import type { Location, StockRow } from '@/api/types'
import { useCan } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useStock } from '@/hooks/useInventory'
import { useRealtimeEvents } from '@/realtime/RealtimeContext'
import { getErrorMessage } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AdjustStockDialog } from './AdjustStockDialog'
import { TransferStockDialog } from './TransferStockDialog'

const PAGE_SIZE = 25

interface StockTabProps {
  locations: Location[]
  lowOnly: boolean
  onLowOnlyChange: (value: boolean) => void
}

export function StockTab({ locations, lowOnly, onLowOnlyChange }: StockTabProps) {
  const canManage = useCan('manager')
  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState('')
  const [page, setPage] = useState(1)
  const [adjusting, setAdjusting] = useState<StockRow | null>(null)
  const [transferring, setTransferring] = useState<StockRow | null>(null)
  const q = useDebouncedValue(search.trim())

  const stock = useStock({
    page,
    size: PAGE_SIZE,
    q: q || undefined,
    location_id: locationId || undefined,
    low_stock: lowOnly || undefined,
  })
  const columns = canManage ? 9 : 8
  // Briefly highlight rows whose stock just changed (from this or another till).
  const [flashed, setFlashed] = useState<Set<string>>(new Set())
  useRealtimeEvents((event) => {
    if (event.type !== 'stock.changed') return
    const key = `${event.variant_id}-${event.location_id}`
    setFlashed((current) => new Set(current).add(key))
    window.setTimeout(
      () =>
        setFlashed((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        }),
      1600,
    )
  })

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search product or SKU…"
            aria-label="Search stock"
            className="pl-9"
          />
        </div>
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
        <Switch
          label="Low stock only"
          checked={lowOnly}
          onChange={(value) => {
            onLowOnlyChange(value)
            setPage(1)
          }}
        />
        <p className="w-full text-xs text-muted">
          A variant is low when its total available across all locations is at or below its reorder
          point.
        </p>
      </div>

      {stock.isError ? (
        <Alert className="m-4">{getErrorMessage(stock.error)}</Alert>
      ) : stock.data?.total === 0 ? (
        <EmptyState
          icon={Boxes}
          title={lowOnly ? 'Nothing is running low' : 'No stock to show'}
          description={
            lowOnly
              ? 'Every item is above its reorder point.'
              : 'Create products to see their stock per location.'
          }
        />
      ) : (
        <>
          <Table scrollY>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>SKU</TH>
                <TH>Location</TH>
                <TH className="text-right">On hand</TH>
                <TH className="text-right">Available</TH>
                <TH className="text-right" title="Available across all locations">
                  All locations
                </TH>
                <TH className="text-right">Reorder at</TH>
                <TH>Status</TH>
                {canManage && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {stock.isPending ? (
                <TableSkeleton columns={columns} />
              ) : (
                stock.data.items.map((row) => (
                  <TR
                    key={`${row.variant_id}-${row.location_id}`}
                    data-flash={flashed.has(`${row.variant_id}-${row.location_id}`) || undefined}
                    className="data-flash:animate-flash"
                  >
                    <TD className="min-w-44">
                      <p className="font-medium text-foreground">{row.product_name}</p>
                      <p className="text-xs text-muted">{row.variant_name}</p>
                    </TD>
                    <TD className="font-mono text-xs text-muted">{row.sku}</TD>
                    <TD>
                      <Badge>{row.location_code}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(row.on_hand)}</TD>
                    <TD
                      className={cn(
                        'text-right font-medium tabular-nums',
                        row.available <= 0 && 'text-danger-ink',
                      )}
                    >
                      {formatNumber(row.available)}
                    </TD>
                    <TD
                      className={cn(
                        'text-right tabular-nums',
                        row.is_low ? 'font-medium text-warning-ink' : 'text-muted',
                      )}
                    >
                      {formatNumber(row.variant_available)}
                    </TD>
                    <TD className="text-right text-muted tabular-nums">{row.reorder_point}</TD>
                    <TD>
                      {/* Status is per variant: low when the all-locations total hits the reorder point. */}
                      {row.variant_available <= 0 ? (
                        <Badge tone="danger" dot>
                          Out of stock
                        </Badge>
                      ) : row.is_low ? (
                        <Badge tone="warning" dot>
                          Low
                        </Badge>
                      ) : (
                        <Badge tone="success" dot>
                          In stock
                        </Badge>
                      )}
                    </TD>
                    {canManage && (
                      <TD>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setAdjusting(row)}>
                            <SlidersHorizontal /> Adjust
                          </Button>
                          {locations.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTransferring(row)}
                              disabled={row.available <= 0}
                            >
                              <ArrowLeftRight /> Transfer
                            </Button>
                          )}
                        </div>
                      </TD>
                    )}
                  </TR>
                ))
              )}
            </TBody>
          </Table>
          {stock.data && (
            <Pagination
              page={page}
              size={PAGE_SIZE}
              total={stock.data.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      <AdjustStockDialog row={adjusting} onClose={() => setAdjusting(null)} />
      <TransferStockDialog
        row={transferring}
        locations={locations}
        onClose={() => setTransferring(null)}
      />
    </>
  )
}
