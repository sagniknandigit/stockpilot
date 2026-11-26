import {
  AlertTriangle,
  Boxes,
  PackageCheck,
  PackagePlus,
  ScanBarcode,
  ShoppingBag,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useState } from 'react'
import { useCan, useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardHeader } from '@/components/ui/Card'
import { Delta } from '@/components/ui/Delta'
import { Skeleton } from '@/components/ui/Skeleton'
import { useSummary } from '@/hooks/useReports'
import { useOrders } from '@/hooks/useSales'
import { getErrorMessage } from '@/lib/errors'
import {
  formatLongDate,
  formatMoney,
  formatNumber,
  hourIn,
  percentChange,
  pluralize,
} from '@/lib/format'
import { fadeUp, stagger } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { HeroRevenueCard } from './HeroRevenueCard'
import { AskAssistantCard } from './AskAssistantCard'
import { LowStockCard } from './LowStockCard'
import { NeedsReorderCard } from './NeedsReorderCard'
import { OnboardingChecklist } from './OnboardingChecklist'
import { RecentOrdersCard } from './RecentOrdersCard'
import { RevenueChart, type ChartMetric } from './RevenueChart'
import { StatCard } from './StatCard'

function greeting(hour: number): string {
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

export function DashboardPage() {
  const { user, organization } = useSession()
  const canManage = useCan('manager')
  const summary = useSummary()
  const anyOrder = useOrders({ size: 1 })
  const [metric, setMetric] = useState<ChartMetric>('revenue')
  const data = summary.data
  const currency = organization.currency
  const now = new Date()

  const money = useCallback((value: number) => formatMoney(value, currency), [currency])
  const days = data?.last_7_days ?? []
  const today = days[days.length - 1]
  const yesterday = days[days.length - 2]

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={fadeUp} className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-muted">
            {formatLongDate(now, organization.timezone)}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
            Good {greeting(hourIn(now, organization.timezone))}, {user.full_name.split(' ')[0]}
          </h1>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <ButtonLink to="/products?new=1" variant="secondary">
              <PackagePlus /> Add product
            </ButtonLink>
          )}
          <ButtonLink to="/pos">
            <ScanBarcode /> New sale
          </ButtonLink>
        </div>
      </motion.div>

      <OnboardingChecklist summary={data} orderCount={anyOrder.data?.total} />

      {summary.isError && (
        <Alert className="mb-6">Couldn’t load the summary: {getErrorMessage(summary.error)}</Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,2fr)]">
        <HeroRevenueCard summary={data} currency={currency} />
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Orders today"
            icon={ShoppingBag}
            value={data?.today_orders}
            format={formatNumber}
            delta={
              today &&
              today.orders > 0 && (
                <Delta
                  value={percentChange(today.orders, yesterday?.orders ?? 0)}
                  label="vs yesterday"
                />
              )
            }
            hint={yesterday && `${pluralize(yesterday.orders, 'order')} yesterday`}
          />
          <StatCard
            label="Inventory value"
            icon={Boxes}
            value={data && Number(data.inventory_value)}
            format={money}
            hint="At cost price"
          />
          <StatCard
            label="Units on hand"
            icon={PackageCheck}
            value={data?.units_on_hand}
            format={formatNumber}
            hint={
              data &&
              `${pluralize(data.active_variants, 'variant')} · ${pluralize(data.active_products, 'product')}`
            }
          />
          <StatCard
            label="Low stock"
            icon={AlertTriangle}
            tone={data && data.low_stock_count > 0 ? 'warning' : 'accent'}
            value={data?.low_stock_count}
            format={formatNumber}
            hint="Variants at or below reorder point"
          />
        </div>
      </div>

      <motion.div variants={fadeUp} className="mt-4">
        <Card>
          <CardHeader
            title={metric === 'revenue' ? 'Revenue' : 'Orders'}
            description="Last 7 days · completed orders, refunds excluded"
            actions={
              <div
                role="radiogroup"
                aria-label="Chart metric"
                className="flex rounded-lg border bg-subtle p-0.5"
              >
                {(['revenue', 'orders'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={metric === value}
                    onClick={() => setMetric(value)}
                    className={cn(
                      'rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors',
                      metric === value
                        ? 'bg-surface text-foreground shadow-card'
                        : 'text-muted hover:text-foreground',
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            }
          />
          <div className="px-3 pb-4 sm:px-5">
            {data ? (
              <RevenueChart data={data.last_7_days} currency={currency} metric={metric} />
            ) : (
              <Skeleton className="h-64 w-full" />
            )}
          </div>
        </Card>
      </motion.div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <NeedsReorderCard />
        <AskAssistantCard />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <LowStockCard />
        <RecentOrdersCard />
      </div>
    </motion.div>
  )
}
