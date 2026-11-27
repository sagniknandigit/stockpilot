import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  Gauge,
  PartyPopper,
  Percent,
  ShoppingBag,
  Snail,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { AbcClass, Analytics } from '@/api/types'
import { useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { Delta } from '@/components/ui/Delta'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useAnalytics } from '@/hooks/useInsights'
import { getErrorMessage } from '@/lib/errors'
import {
  addDays,
  daysBetween,
  formatMoney,
  formatNumber,
  formatRelative,
  todayIn,
} from '@/lib/format'
import { fadeUp, stagger } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { CategoryChart, RevenueProfitChart } from './AnalyticsCharts'
import { InsightsTabs } from './InsightsTabs'

const PRESETS = [7, 30, 90] as const
const ABC_TONE: Record<AbcClass, BadgeTone> = { A: 'accent', B: 'info', C: 'neutral' }
const ABC_BAR: Record<AbcClass, string> = { A: 'bg-chart-1', B: 'bg-chart-2', C: 'bg-chart-3' }

export function AnalyticsPage() {
  const { organization } = useSession()
  const today = todayIn(organization.timezone)
  const [range, setRange] = useState<{ from: string; to: string; preset: number | null }>(() => ({
    from: addDays(today, -29),
    to: today,
    preset: 30,
  }))
  const validRange = range.from <= range.to && daysBetween(range.from, range.to) <= 365
  const analytics = useAnalytics(range.from, range.to, validRange)
  const data = analytics.data
  const currency = organization.currency
  const money = (value: string | number) => formatMoney(value, currency)

  return (
    <>
      <PageHeader
        title="Insights"
        description="How the business is performing, and where the stock money sits."
      />
      <InsightsTabs />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div
          role="radiogroup"
          aria-label="Date range"
          className="flex rounded-lg border bg-subtle p-0.5"
        >
          {PRESETS.map((days) => (
            <button
              key={days}
              type="button"
              role="radio"
              aria-checked={range.preset === days}
              onClick={() =>
                setRange({ from: addDays(today, -(days - 1)), to: today, preset: days })
              }
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                range.preset === days
                  ? 'bg-surface text-foreground shadow-card'
                  : 'text-muted hover:text-foreground',
              )}
            >
              {days} days
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          From
          <Input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) =>
              e.target.value && setRange((r) => ({ ...r, from: e.target.value, preset: null }))
            }
            className="h-8 w-40"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          To
          <Input
            type="date"
            value={range.to}
            min={range.from}
            max={today}
            onChange={(e) =>
              e.target.value && setRange((r) => ({ ...r, to: e.target.value, preset: null }))
            }
            className="h-8 w-40"
          />
        </label>
        {analytics.isFetching && data && <span className="text-xs text-muted">Updating…</span>}
      </div>

      {!validRange ? (
        <Alert>Choose a range of at most 366 days, with the start before the end.</Alert>
      ) : analytics.isError ? (
        <Alert>{getErrorMessage(analytics.error)}</Alert>
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
          <Skeleton className="h-80 rounded-2xl sm:col-span-2 xl:col-span-5" />
        </div>
      ) : (
        <AnalyticsBody data={data} money={money} currency={currency} />
      )}
    </>
  )
}

function AnalyticsBody({
  data,
  money,
  currency,
}: {
  data: Analytics
  money: (v: string | number) => string
  currency: string
}) {
  const t = data.totals
  const kpis = [
    {
      label: 'Revenue',
      value: money(t.revenue),
      icon: CircleDollarSign,
      extra: <Delta value={t.revenue_change_pct} label="vs previous period" />,
    },
    {
      label: 'Gross profit',
      value: money(t.gross_profit),
      icon: BarChart3,
      extra: t.gross_margin_pct !== null && (
        <span className="text-xs text-muted">{t.gross_margin_pct.toFixed(1)}% margin</span>
      ),
    },
    {
      label: 'Orders',
      value: formatNumber(t.orders),
      icon: ShoppingBag,
      extra: <span className="text-xs text-muted">{formatNumber(t.units)} units</span>,
    },
    { label: 'Avg. order value', value: money(t.avg_order_value), icon: Percent },
    {
      label: 'Inventory turnover',
      value: data.inventory.turnover === null ? '—' : `${data.inventory.turnover.toFixed(1)}×`,
      icon: Gauge,
      extra: data.inventory.days_of_inventory !== null && (
        <span className="text-xs text-muted">
          {data.inventory.days_of_inventory.toFixed(0)} days of stock
        </span>
      ),
    },
  ]

  if (t.orders === 0) {
    return (
      <Card>
        <EmptyState
          title="No sales in this period"
          description="Pick a different date range to see analytics."
        />
      </Card>
    )
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map(({ label, value, icon: Icon, extra }) => (
          <motion.div
            key={label}
            variants={fadeUp}
            className="rounded-2xl border bg-surface p-5 shadow-card"
          >
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-muted">{label}</p>
              <Icon className="size-4 text-muted" aria-hidden="true" />
            </div>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
            <div className="mt-1 min-h-5">{extra}</div>
          </motion.div>
        ))}
      </div>

      <motion.div variants={fadeUp} className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Revenue & gross profit"
            description="Daily, completed sales"
            actions={
              <div className="flex gap-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-1" aria-hidden="true" /> Revenue
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-2" aria-hidden="true" /> Gross
                  profit
                </span>
              </div>
            }
          />
          <div className="px-3 pb-4 sm:px-5">
            <RevenueProfitChart daily={data.daily} currency={currency} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Sales by category" description="Revenue in this period" />
          <div className="px-3 pb-4 sm:px-5">
            <CategoryChart categories={data.categories} currency={currency} />
          </div>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp} className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Top products" description="Ranked by revenue, with ABC class" />
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Product</TH>
                <TH>Class</TH>
                <TH className="text-right">Units</TH>
                <TH className="text-right">Revenue</TH>
                <TH className="text-right">Gross profit</TH>
              </TR>
            </THead>
            <TBody>
              {data.products.slice(0, 10).map((p, index) => (
                <TR key={p.variant_id}>
                  <TD className="w-10 text-muted">{index + 1}</TD>
                  <TD className="min-w-48">
                    <p className="font-medium text-foreground">{p.name}</p>
                    <p className="font-mono text-xs text-muted">{p.sku}</p>
                  </TD>
                  <TD>
                    <Badge tone={ABC_TONE[p.abc_class]}>{p.abc_class}</Badge>
                  </TD>
                  <TD className="text-right">{formatNumber(p.units)}</TD>
                  <TD className="text-right font-medium whitespace-nowrap">{money(p.revenue)}</TD>
                  <TD className="text-right whitespace-nowrap text-muted">
                    {money(p.gross_profit)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="ABC analysis" description="Share of revenue by product class" />
          <div className="px-5 pb-5">
            {/* Pareto bar: A items are few but carry most of the revenue. */}
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
              {data.abc.map((b) => (
                <motion.div
                  key={b.abc_class}
                  className={ABC_BAR[b.abc_class]}
                  initial={{ width: 0 }}
                  animate={{ width: `${b.revenue_share * 100}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              ))}
            </div>
            <ul className="mt-4 space-y-3">
              {data.abc.map((b) => (
                <li key={b.abc_class} className="flex items-center gap-3">
                  <span
                    className={cn('size-2.5 shrink-0 rounded-full', ABC_BAR[b.abc_class])}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-[13px]">
                    <span className="font-semibold text-foreground">Class {b.abc_class}</span>
                    <span className="text-muted"> · {b.variants} products</span>
                  </span>
                  <span className="text-right text-[13px]">
                    <span className="font-semibold text-foreground">
                      {(b.revenue_share * 100).toFixed(0)}%
                    </span>
                    <span className="block text-xs text-muted">{money(b.revenue)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Class A products earn ~80% of revenue — keep them in stock. Class C items are
              candidates to trim.
            </p>
          </div>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp} className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<Snail />}
            title="Slow movers"
            description="More than 45 days of stock at this period’s sales pace"
          />
          {data.slow_movers.length === 0 ? (
            <EmptyState
              compact
              icon={PartyPopper}
              title="No slow movers"
              description="Everything sells through within about six weeks — your stock is working hard."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH className="text-right">On hand</TH>
                  <TH className="text-right">Stock value</TH>
                  <TH className="text-right">Sold</TH>
                  <TH className="text-right">Cover</TH>
                  <TH>Last sale</TH>
                </TR>
              </THead>
              <TBody>
                {data.slow_movers.slice(0, 8).map((s) => (
                  <TR key={s.variant_id}>
                    <TD className="min-w-44">
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="font-mono text-xs text-muted">{s.sku}</p>
                    </TD>
                    <TD className="text-right">{formatNumber(s.on_hand)}</TD>
                    <TD className="text-right whitespace-nowrap">{money(s.stock_value)}</TD>
                    <TD className="text-right">{formatNumber(s.units_sold)}</TD>
                    <TD className="text-right font-medium whitespace-nowrap text-warning-ink">
                      {s.days_of_cover === null
                        ? 'No sales'
                        : `~${Math.round(s.days_of_cover)} days`}
                    </TD>
                    <TD className="whitespace-nowrap text-muted">
                      {s.last_sold_at ? formatRelative(s.last_sold_at) : 'Never'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent-soft-foreground">
              <Boxes className="size-4" aria-hidden="true" />
            </span>
            <h2 className="font-semibold text-foreground">Inventory health</h2>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {[
              ['Stock value', money(data.inventory.stock_value)],
              ['Cost of goods sold', money(data.inventory.cogs)],
              [
                'Turnover (annualised)',
                data.inventory.turnover === null ? '—' : `${data.inventory.turnover.toFixed(1)}×`,
              ],
              [
                'Days of inventory',
                data.inventory.days_of_inventory === null
                  ? '—'
                  : data.inventory.days_of_inventory.toFixed(0),
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-subtle/40 p-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">
            Higher turnover means stock sells through faster; days of inventory is how long current
            stock lasts at this period’s pace.
          </p>
        </Card>
      </motion.div>
    </motion.div>
  )
}
