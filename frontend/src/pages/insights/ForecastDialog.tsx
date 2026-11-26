import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ForecastPoint } from '@/api/types'
import { Alert } from '@/components/ui/Alert'
import { Dialog } from '@/components/ui/Dialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { useForecast } from '@/hooks/useInsights'
import { getErrorMessage } from '@/lib/errors'
import { formatCalendarDate } from '@/lib/format'
import { formatWape } from './urgency'

interface ForecastDialogProps {
  variantId: string | null
  onClose: () => void
}

/** 56 days of actual daily sales, then a 14-day forecast (dashed) over a shaded future band. */
export function ForecastDialog({ variantId, onClose }: ForecastDialogProps) {
  const forecast = useForecast(variantId)
  const data = forecast.data

  return (
    <Dialog
      open={variantId !== null}
      onClose={onClose}
      size="xl"
      title={
        data
          ? `${data.product_name}${data.variant_name !== 'Default' ? ` · ${data.variant_name}` : ''}`
          : 'Demand forecast'
      }
      description={data ? `${data.sku} · daily units sold and forecast` : undefined}
    >
      {forecast.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : forecast.isError ? (
        <Alert>{getErrorMessage(forecast.error)}</Alert>
      ) : data ? (
        <>
          <dl className="mb-4 grid grid-cols-3 gap-3">
            {[
              ['Forecast demand', `${data.avg_daily_demand.toFixed(1)} / day`],
              ['Model error (WAPE)', formatWape(data.model_wape)],
              ['Baseline error', formatWape(data.baseline_wape)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-subtle/40 p-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          <ForecastChart points={data.points} />
          <p className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-chart-3" aria-hidden="true" /> Actual units
              sold
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 border-t-2 border-dashed border-chart-1"
                aria-hidden="true"
              />{' '}
              Forecast
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-accent-soft" aria-hidden="true" /> Next 14
              days
            </span>
          </p>
        </>
      ) : null}
    </Dialog>
  )
}

function ForecastChart({ points }: { points: ForecastPoint[] }) {
  const firstFuture = points.find((p) => p.actual === null)?.day
  const lastDay = points[points.length - 1]?.day
  const label = (day: string) => formatCalendarDate(day, { day: 'numeric', month: 'short' })

  return (
    <>
      <div className="h-72 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            {firstFuture && lastDay && (
              <ReferenceArea
                x1={firstFuture}
                x2={lastDay}
                fill="var(--accent-soft)"
                fillOpacity={0.7}
                strokeOpacity={0}
              />
            )}
            <XAxis
              dataKey="day"
              tickFormatter={label}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: 'var(--subtle)' }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as ForecastPoint | undefined
                if (!active || !point) return null
                return (
                  <div className="rounded-xl border bg-surface-raised px-3 py-2 text-[13px] shadow-pop">
                    <p className="text-xs text-muted">
                      {formatCalendarDate(point.day, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    {point.actual !== null && (
                      <p className="font-semibold text-foreground">{point.actual} sold</p>
                    )}
                    {point.forecast !== null && (
                      <p className="text-foreground">{point.forecast.toFixed(1)} forecast</p>
                    )}
                  </div>
                )
              }}
            />
            <Bar dataKey="actual" fill="var(--chart-3)" radius={[3, 3, 0, 0]} maxBarSize={10} />
            <Line
              dataKey="forecast"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={false}
              connectNulls={false}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Daily units sold and forecast</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Actual</th>
            <th scope="col">Forecast</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <td>{p.day}</td>
              <td>{p.actual ?? '—'}</td>
              <td>{p.forecast?.toFixed(1) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
