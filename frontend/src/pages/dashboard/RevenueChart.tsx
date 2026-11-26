import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DailySales } from '@/api/types'
import {
  formatDayLabel,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  pluralize,
} from '@/lib/format'

export type ChartMetric = 'revenue' | 'orders'

interface RevenueChartProps {
  data: DailySales[]
  currency: string
  metric: ChartMetric
}

interface ChartPoint {
  label: string
  revenue: number
  orders: number
}

/** Single-series area chart (revenue or orders). The hidden table is the accessible view. */
export function RevenueChart({ data, currency, metric }: RevenueChartProps) {
  // Number() is fine here: values only position marks, they are never summed for display.
  const points: ChartPoint[] = data.map((d) => ({
    label: formatDayLabel(d.day),
    revenue: Number(d.revenue),
    orders: d.orders,
  }))

  return (
    <>
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="revenue-stroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="var(--accent-2)" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              dy={6}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              tickFormatter={(value: number) =>
                metric === 'revenue' ? formatMoneyCompact(value, currency) : formatNumber(value)
              }
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '4 4' }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as ChartPoint | undefined
                if (!active || !point) return null
                return (
                  <div className="rounded-xl border bg-surface-raised px-3 py-2 text-[13px] shadow-pop">
                    <p className="text-xs text-muted">{point.label}</p>
                    <p className="font-semibold text-foreground">
                      {formatMoney(point.revenue, currency)}
                    </p>
                    <p className="text-xs text-muted">{pluralize(point.orders, 'order')}</p>
                  </div>
                )
              }}
            />
            <Area
              key={metric}
              type="monotone"
              dataKey={metric}
              stroke="url(#revenue-stroke)"
              strokeWidth={2.5}
              fill="url(#revenue-fill)"
              activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2, fill: 'var(--accent)' }}
              dot={false}
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Revenue and orders for the last 7 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Orders</th>
            <th scope="col">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{formatDayLabel(d.day)}</td>
              <td>{d.orders}</td>
              <td>{formatMoney(d.revenue, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
