import { CheckCircle2, LineChart, ShoppingCart, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { ReorderSuggestion } from '@/api/types'
import { useCan, useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useReorderSuggestions } from '@/hooks/useInsights'
import { getErrorMessage } from '@/lib/errors'
import { daysBetween, formatDateTime, formatMoney, todayIn } from '@/lib/format'
import { fadeUp, spring, stagger } from '@/lib/motion'
import { toCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { AccuracyCard } from './AccuracyCard'
import { CreatePoDialog } from './CreatePoDialog'
import { ForecastDialog } from './ForecastDialog'
import { InsightsTabs } from './InsightsTabs'
import { runsOutLabel, URGENCY } from './urgency'

/** Bars are scaled against a 30-day window: anything beyond reads as "plenty". */
const COVER_WINDOW_DAYS = 30

export function ReorderPlannerPage() {
  const { organization } = useSession()
  const canOrder = useCan('manager')
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [forecastFor, setForecastFor] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const suggestions = useReorderSuggestions(!showAll)
  const items = suggestions.data?.items ?? []
  const today = todayIn(organization.timezone)
  const money = (cents: number) => formatMoney(cents / 100, organization.currency)

  const selectedItems = items.filter((item) => selected.has(item.variant_id))
  const orderable = items.filter((item) => item.suggested_qty > 0)
  const spendCents = (list: ReorderSuggestion[]) =>
    list.reduce((sum, item) => sum + toCents(item.unit_cost) * item.suggested_qty, 0)
  const counts = { critical: 0, warning: 0, ok: 0 }
  items.forEach((item) => counts[item.urgency]++)

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <PageHeader
        title="Insights"
        description={
          suggestions.data
            ? `Demand forecasts from ${suggestions.data.history_days} days of sales · ${Math.round(suggestions.data.service_level * 100)}% service level · updated ${formatDateTime(suggestions.data.generated_at, organization.timezone)}`
            : 'Demand forecasts and what to reorder.'
        }
      />
      <InsightsTabs />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.5fr)]"
      >
        {suggestions.data ? (
          <>
            <motion.div variants={fadeUp}>
              <SummaryTile
                label="Critical"
                value={counts.critical}
                hint="Will run out before a delivery can arrive"
                tone="danger"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <SummaryTile
                label="Reorder soon"
                value={counts.warning}
                hint="Below target cover within lead time"
                tone="warning"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <SummaryTile
                label="Suggested spend"
                value={money(spendCents(orderable))}
                hint={`${orderable.length} products at current cost`}
              />
            </motion.div>
            <motion.div variants={fadeUp} className="md:col-span-3 xl:col-span-1">
              <AccuracyCard accuracy={suggestions.data.accuracy} />
            </motion.div>
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)
        )}
      </motion.div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="font-semibold text-foreground">Reorder planner</h2>
            <p className="text-[13px] text-muted">
              Select products to turn them into a draft purchase order.
            </p>
          </div>
          <Switch label="Show all products" checked={showAll} onChange={setShowAll} />
        </div>

        {suggestions.isError ? (
          <Alert className="m-4">{getErrorMessage(suggestions.error)}</Alert>
        ) : items.length === 0 && !suggestions.isPending ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing needs reordering"
            description="Every product has enough stock (including what’s on order) to cover its forecast demand."
          />
        ) : (
          <Table scrollY>
            <THead>
              <TR>
                {canOrder && (
                  <TH className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="size-4 accent-[var(--accent)]"
                      checked={
                        orderable.length > 0 && orderable.every((i) => selected.has(i.variant_id))
                      }
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? new Set(orderable.map((i) => i.variant_id))
                            : new Set(),
                        )
                      }
                    />
                  </TH>
                )}
                <TH>Product</TH>
                <TH>Urgency</TH>
                <TH className="min-w-40">Cover</TH>
                <TH>Runs out</TH>
                <TH className="text-right">Demand / day</TH>
                <TH className="text-right">Suggested</TH>
                <TH>Last supplier</TH>
                <TH className="w-px">
                  <span className="sr-only">Forecast</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {suggestions.isPending ? (
                <TableSkeleton columns={canOrder ? 9 : 8} />
              ) : (
                items.map((item) => {
                  const cover = item.days_of_cover
                  const runsOut = item.stockout_date ? daysBetween(today, item.stockout_date) : null
                  const isSelected = selected.has(item.variant_id)
                  return (
                    <TR key={item.variant_id} className={cn(isSelected && 'bg-accent-soft/50')}>
                      {canOrder && (
                        <TD>
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--accent)]"
                            aria-label={`Select ${item.sku}`}
                            checked={isSelected}
                            disabled={item.suggested_qty === 0}
                            onChange={() => toggle(item.variant_id)}
                          />
                        </TD>
                      )}
                      <TD className="min-w-48">
                        <p className="font-medium text-foreground">
                          {item.product_name}
                          {item.variant_name !== 'Default' && (
                            <span className="font-normal text-muted"> · {item.variant_name}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          <span className="font-mono">{item.sku}</span> · {item.available} in stock
                          {item.on_order > 0 && ` · ${item.on_order} on order`}
                        </p>
                      </TD>
                      <TD>
                        <Badge tone={URGENCY[item.urgency].tone} dot>
                          {URGENCY[item.urgency].label}
                        </Badge>
                      </TD>
                      <TD>
                        <p className="mb-1 text-xs text-muted">
                          {cover === null
                            ? 'No recent demand'
                            : `${cover.toFixed(cover < 10 ? 1 : 0)} days · lead ${item.lead_time_days}d`}
                        </p>
                        <div className="relative h-1.5 rounded-full bg-subtle" aria-hidden="true">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              item.urgency === 'critical'
                                ? 'bg-danger'
                                : item.urgency === 'warning'
                                  ? 'bg-warning'
                                  : 'bg-success',
                            )}
                            style={{
                              width: `${Math.min((cover ?? COVER_WINDOW_DAYS) / COVER_WINDOW_DAYS, 1) * 100}%`,
                            }}
                          />
                          {/* Lead-time marker: cover left of this line runs out before a delivery could arrive. */}
                          <span
                            className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-foreground/50"
                            style={{
                              left: `${Math.min(item.lead_time_days / COVER_WINDOW_DAYS, 1) * 100}%`,
                            }}
                          />
                        </div>
                      </TD>
                      <TD
                        className={cn(
                          'whitespace-nowrap',
                          runsOut !== null && runsOut <= item.lead_time_days
                            ? 'font-medium text-danger-ink'
                            : 'text-muted',
                        )}
                      >
                        {runsOutLabel(runsOut) ?? '—'}
                      </TD>
                      <TD className="text-right">{item.avg_daily_demand.toFixed(1)}</TD>
                      <TD className="text-right">
                        <p className="font-semibold text-foreground">{item.suggested_qty}</p>
                        {item.suggested_qty > 0 && (
                          <p className="text-xs text-muted">
                            {money(toCents(item.unit_cost) * item.suggested_qty)}
                          </p>
                        )}
                      </TD>
                      <TD className="max-w-44 truncate text-muted">
                        {item.last_supplier_name ?? '—'}
                      </TD>
                      <TD>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setForecastFor(item.variant_id)}
                          aria-label={`Forecast for ${item.sku}`}
                          title="View forecast"
                        >
                          <LineChart />
                        </Button>
                      </TD>
                    </TR>
                  )
                })
              )}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Floating action bar for the current selection */}
      <AnimatePresence>
        {selectedItems.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={spring}
            className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border bg-surface-raised p-3 pl-5 shadow-pop"
          >
            <Sparkles className="size-4 text-accent" aria-hidden="true" />
            <p className="flex-1 text-[13px]">
              <span className="font-semibold text-foreground">{selectedItems.length} selected</span>
              <span className="text-muted"> · {money(spendCents(selectedItems))}</span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button onClick={() => setCreating(true)}>
              <ShoppingCart /> Create purchase order
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <ForecastDialog variantId={forecastFor} onClose={() => setForecastFor(null)} />
      <CreatePoDialog
        items={selectedItems}
        open={creating}
        onClose={() => {
          setCreating(false)
        }}
      />
    </>
  )
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number | string
  hint: string
  tone?: 'danger' | 'warning'
}) {
  return (
    <Card className="flex h-full flex-col p-5">
      <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
        {tone && (
          <span
            className={cn('size-2 rounded-full', tone === 'danger' ? 'bg-danger' : 'bg-warning')}
            aria-hidden="true"
          />
        )}
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-auto pt-3 text-xs text-muted">{hint}</p>
    </Card>
  )
}
