import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Analytics } from '@/api/types'
import { formatCalendarDate, formatMoney, formatMoneyCompact, formatNumber } from '@/lib/format'

/** Revenue and gross profit share one currency axis, so they can share one chart. */
export function RevenueProfitChart({
  daily,
  currency,
}: {
  daily: Analytics['daily']
  currency: string
}) {
  const points = daily.map((d) => ({
    day: d.day,
    revenue: Number(d.revenue),
    profit: Number(d.gross_profit),
    orders: d.orders,
  }))
  return (
    <div className="h-72 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="an-revenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="an-profit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="day"
            tickFormatter={(day: string) =>
              formatCalendarDate(day, { day: 'numeric', month: 'short' })
            }
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatMoneyCompact(v, currency)}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '4 4' }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof points)[number] | undefined
              if (!active || !p) return null
              return (
                <div className="rounded-xl border bg-surface-raised px-3 py-2 text-[13px] shadow-pop">
                  <p className="text-xs text-muted">
                    {formatCalendarDate(p.day, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                  <p className="flex items-center gap-1.5 font-semibold text-foreground">
                    <span className="size-2 rounded-full bg-chart-1" />{' '}
                    {formatMoney(p.revenue, currency)} revenue
                  </p>
                  <p className="flex items-center gap-1.5 text-foreground">
                    <span className="size-2 rounded-full bg-chart-2" />{' '}
                    {formatMoney(p.profit, currency)} profit
                  </p>
                  <p className="text-xs text-muted">{formatNumber(p.orders)} orders</p>
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#an-revenue)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="profit"
            stroke="var(--chart-2)"
            strokeWidth={2}
            fill="url(#an-profit)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontal bars, sorted, labelled directly: easier to compare than a donut. */
export function CategoryChart({
  categories,
  currency,
}: {
  categories: Analytics['categories']
  currency: string
}) {
  const points = [...categories]
    .sort((a, b) => Number(b.revenue) - Number(a.revenue))
    .map((c) => ({ name: c.category, revenue: Number(c.revenue), units: c.units }))
  return (
    <div
      style={{ height: Math.max(points.length * 40, 120) }}
      className="w-full"
      aria-hidden="true"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={points}
          layout="vertical"
          margin={{ top: 0, right: 64, bottom: 0, left: 0 }}
          barCategoryGap={8}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={104}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--foreground)', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--subtle)' }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof points)[number] | undefined
              if (!active || !p) return null
              return (
                <div className="rounded-xl border bg-surface-raised px-3 py-2 text-[13px] shadow-pop">
                  <p className="font-semibold text-foreground">{p.name}</p>
                  <p className="text-foreground">{formatMoney(p.revenue, currency)}</p>
                  <p className="text-xs text-muted">{formatNumber(p.units)} units</p>
                </div>
              )
            }}
          />
          <Bar
            dataKey="revenue"
            fill="var(--chart-1)"
            radius={[0, 4, 4, 0]}
            label={{
              position: 'right',
              fill: 'var(--muted)',
              fontSize: 11,
              formatter: (v: unknown) => formatMoneyCompact(Number(v), currency),
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
