import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailySales } from '@/api/types'
import { formatDayLabel, formatMoney, formatMoneyCompact, pluralize } from '@/lib/format'

interface RevenueChartProps {
  data: DailySales[]
  currency: string
}

interface ChartPoint {
  label: string
  revenue: number
  orders: number
}

/** Single-series bar chart of the last 7 days. The table below it is the accessible view. */
export function RevenueChart({ data, currency }: RevenueChartProps) {
  // Number() is fine here: values are only used to size bars, never summed for display.
  const points: ChartPoint[] = data.map((d) => ({
    label: formatDayLabel(d.day),
    revenue: Number(d.revenue),
    orders: d.orders,
  }))

  return (
    <>
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="28%"
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
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
              tickFormatter={(value: number) => formatMoneyCompact(value, currency)}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--subtle)' }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as ChartPoint | undefined
                if (!active || !point) return null
                return (
                  <div className="rounded-lg border bg-surface px-3 py-2 text-[13px] shadow-lg">
                    <p className="text-xs text-muted">{point.label}</p>
                    <p className="font-semibold text-foreground tabular-nums">
                      {formatMoney(point.revenue, currency)}
                    </p>
                    <p className="text-xs text-muted">{pluralize(point.orders, 'order')}</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="revenue" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Revenue for the last 7 days</caption>
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
