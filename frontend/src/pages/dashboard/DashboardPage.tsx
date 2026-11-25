import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CircleDollarSign,
  PackageCheck,
  ShoppingBag,
} from 'lucide-react'
import { Link } from 'react-router'
import { useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useStock } from '@/hooks/useInventory'
import { useCurrentLocation } from '@/providers/LocationContext'
import { useSummary } from '@/hooks/useReports'
import { getErrorMessage } from '@/lib/errors'
import { formatMoney, formatNumber, pluralize } from '@/lib/format'
import { fromCents, toCents } from '@/lib/money'
import { KpiCard } from './KpiCard'
import { RevenueChart } from './RevenueChart'

const LOW_STOCK_ROWS = 8

export function DashboardPage() {
  const { user, organization } = useSession()
  const summary = useSummary()
  const { location, isLoading: locationsLoading } = useCurrentLocation()
  // The low-stock filter returns one row per (variant, location). Every active variant has a
  // row at every location, so scoping to the current location yields one row per low variant
  // (matching the KPI count) and shows what's on the shelf here next to the overall total.
  const lowStock = useStock(
    { low_stock: true, size: LOW_STOCK_ROWS, location_id: location?.id },
    !locationsLoading,
  )
  const data = summary.data
  const currency = organization.currency

  const weekRevenue = data
    ? fromCents(data.last_7_days.reduce((sum, day) => sum + toCents(day.revenue), 0))
    : '0'
  const weekOrders = data?.last_7_days.reduce((sum, day) => sum + day.orders, 0) ?? 0

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${user.full_name.split(' ')[0]}`}
        description="Here’s how your store is doing today."
      />

      {summary.isError && (
        <Alert className="mb-6">Couldn’t load the summary: {getErrorMessage(summary.error)}</Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Today’s revenue"
          icon={CircleDollarSign}
          loading={summary.isPending}
          value={data && formatMoney(data.today_revenue, currency)}
          hint={data && `${pluralize(data.today_orders, 'order')} today`}
        />
        <KpiCard
          label="Inventory value"
          icon={Boxes}
          loading={summary.isPending}
          value={data && formatMoney(data.inventory_value, currency)}
          hint="At cost price"
        />
        <KpiCard
          label="Units on hand"
          icon={PackageCheck}
          loading={summary.isPending}
          value={data && formatNumber(data.units_on_hand)}
          hint={
            data &&
            `${pluralize(data.active_variants, 'variant')} · ${pluralize(data.active_products, 'product')}`
          }
        />
        <KpiCard
          label="Low stock"
          icon={AlertTriangle}
          tone={data && data.low_stock_count > 0 ? 'warning' : 'default'}
          loading={summary.isPending}
          value={data && formatNumber(data.low_stock_count)}
          hint="Variants at or below reorder point"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Revenue, last 7 days"
            description={
              data
                ? `${formatMoney(weekRevenue, currency)} from ${pluralize(weekOrders, 'order')}`
                : 'Completed orders, refunds excluded'
            }
          />
          <div className="px-3 pt-4 pb-3 sm:px-5">
            {data ? (
              <RevenueChart data={data.last_7_days} currency={currency} />
            ) : (
              <Skeleton className="h-64 w-full" />
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Low stock"
            description="Total available across all locations is at or below the reorder point"
            actions={
              <Link
                to="/inventory?low=1"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
              >
                View all <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />
          {lowStock.data?.items.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Everything is well stocked"
              description="Items at or below their reorder point will show up here."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH className="text-right">{location ? `At ${location.code}` : 'Here'}</TH>
                  <TH className="text-right">All locations</TH>
                </TR>
              </THead>
              <TBody>
                {lowStock.isPending ? (
                  <TableSkeleton columns={3} rows={5} />
                ) : (
                  lowStock.data?.items.map((row) => (
                    <TR key={`${row.variant_id}-${row.location_id}`}>
                      <TD className="min-w-40">
                        <p className="font-medium text-foreground">{row.product_name}</p>
                        <p className="text-xs text-muted">
                          {row.variant_name} · {row.sku}
                        </p>
                      </TD>
                      <TD className="text-right text-muted tabular-nums">
                        {formatNumber(row.available)}
                      </TD>
                      <TD className="text-right whitespace-nowrap tabular-nums">
                        <span
                          className={
                            row.variant_available <= 0
                              ? 'font-semibold text-red-600 dark:text-red-400'
                              : 'font-medium text-foreground'
                          }
                        >
                          {formatNumber(row.variant_available)}
                        </span>
                        <span className="text-muted"> / {row.reorder_point}</span>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}
