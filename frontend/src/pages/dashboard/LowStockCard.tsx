import { AlertTriangle, ArrowRight, PackagePlus } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { StockRow } from '@/api/types'
import { useCan } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useStock } from '@/hooks/useInventory'
import { formatNumber } from '@/lib/format'
import { fadeUp } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useCurrentLocation } from '@/providers/LocationContext'
import { AdjustStockDialog } from '@/pages/inventory/AdjustStockDialog'

const ROWS = 6

export function LowStockCard() {
  const canRestock = useCan('manager')
  const { location, isLoading } = useCurrentLocation()
  const [restocking, setRestocking] = useState<StockRow | null>(null)
  // Low stock is judged on the all-locations total, so the filter returns one row per location.
  // Scoping to the current location gives one row per low variant, plus what's on the shelf here.
  const lowStock = useStock({ low_stock: true, size: ROWS, location_id: location?.id }, !isLoading)

  return (
    <motion.div variants={fadeUp} className="h-full min-w-0">
      <Card className="flex h-full flex-col">
        <CardHeader
          icon={<AlertTriangle />}
          title="Low stock"
          description="Total across locations at or below reorder point"
          actions={
            <Link
              to="/inventory?low=1"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
            >
              View all <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        />
        {lowStock.isPending ? (
          <ul className="space-y-4 px-5 pt-1 pb-5">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-1.5 w-full" />
              </li>
            ))}
          </ul>
        ) : lowStock.data?.items.length === 0 ? (
          <EmptyState
            compact
            title="Everything is well stocked"
            description="Items at or below their reorder point show up here."
          />
        ) : (
          <ul className="divide-y px-5 pb-2">
            {lowStock.data?.items.map((row) => {
              const ratio =
                row.reorder_point > 0 ? Math.min(row.variant_available / row.reorder_point, 1) : 0
              const out = row.variant_available <= 0
              return (
                <li
                  key={`${row.variant_id}-${row.location_id}`}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {row.product_name}
                        {row.variant_name !== 'Default' && (
                          <span className="font-normal text-muted"> · {row.variant_name}</span>
                        )}
                      </p>
                      <p className="shrink-0 text-xs text-muted">
                        <span
                          className={cn(
                            'font-semibold',
                            out ? 'text-danger-ink' : 'text-foreground',
                          )}
                        >
                          {formatNumber(row.variant_available)}
                        </span>{' '}
                        / {row.reorder_point}
                      </p>
                    </div>
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle"
                      role="meter"
                      aria-label={`${row.sku} stock vs reorder point`}
                      aria-valuemin={0}
                      aria-valuemax={row.reorder_point}
                      aria-valuenow={Math.max(row.variant_available, 0)}
                    >
                      <motion.div
                        className={cn(
                          'h-full rounded-full',
                          out || ratio < 0.34 ? 'bg-danger' : 'bg-warning',
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(ratio * 100, out ? 0 : 4)}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {row.sku} · {formatNumber(row.available)} at {row.location_code}
                    </p>
                  </div>
                  {canRestock && (
                    <Button
                      variant="soft"
                      size="sm"
                      onClick={() => setRestocking(row)}
                      aria-label={`Restock ${row.sku}`}
                    >
                      <PackagePlus /> Restock
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <AdjustStockDialog row={restocking} onClose={() => setRestocking(null)} />
    </motion.div>
  )
}
