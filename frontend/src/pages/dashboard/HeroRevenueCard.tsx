import { motion } from 'motion/react'
import { useCallback } from 'react'
import type { Summary } from '@/api/types'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Delta } from '@/components/ui/Delta'
import { Skeleton } from '@/components/ui/Skeleton'
import { Sparkline } from '@/components/ui/Sparkline'
import { formatMoney, percentChange, pluralize } from '@/lib/format'
import { fadeUp } from '@/lib/motion'
import { toCents } from '@/lib/money'

/** The headline number: today's revenue on the brand gradient, with a 7-day sparkline. */
export function HeroRevenueCard({
  summary,
  currency,
}: {
  summary: Summary | undefined
  currency: string
}) {
  const format = useCallback((value: number) => formatMoney(value, currency), [currency])

  if (!summary) {
    return <Skeleton className="h-full min-h-44 rounded-2xl" />
  }

  const days = summary.last_7_days
  const today = days[days.length - 1]
  const yesterday = days[days.length - 2]
  // Cents for exactness; the number is only converted to a float for display/animation.
  const todayCents = toCents(summary.today_revenue)
  const yesterdayCents = yesterday ? toCents(yesterday.revenue) : 0
  const weekCents = days.reduce((sum, d) => sum + toCents(d.revenue), 0)
  const weekOrders = days.reduce((sum, d) => sum + d.orders, 0)
  const noSalesYet = today?.orders === 0

  return (
    <motion.section
      variants={fadeUp}
      aria-label="Today's revenue"
      className="relative isolate overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-glow"
    >
      {/* Soft light blobs for depth */}
      <div
        className="absolute -top-16 -right-10 -z-10 size-56 rounded-full bg-white/15 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-20 left-10 -z-10 size-48 rounded-full bg-black/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-white/80">Today’s revenue</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <AnimatedNumber
              value={todayCents / 100}
              format={format}
              className="text-4xl font-semibold tracking-tight"
            />
            {!noSalesYet && (
              <Delta
                value={percentChange(todayCents, yesterdayCents)}
                label="vs yesterday"
                onBrand
              />
            )}
          </div>
          <p className="mt-1 text-[13px] text-white/75">
            {noSalesYet
              ? `No sales yet today · yesterday ${formatMoney(yesterdayCents / 100, currency)}`
              : `${pluralize(summary.today_orders, 'order')} · vs ${formatMoney(yesterdayCents / 100, currency)} yesterday`}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between gap-6">
        <dl className="flex gap-6">
          <div>
            <dt className="text-xs text-white/70">Last 7 days</dt>
            <dd className="text-lg font-semibold">{formatMoney(weekCents / 100, currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/70">Orders</dt>
            <dd className="text-lg font-semibold">{weekOrders.toLocaleString()}</dd>
          </div>
        </dl>
        <Sparkline values={days.map((d) => toCents(d.revenue))} className="h-12 w-36 text-white" />
      </div>
    </motion.section>
  )
}
