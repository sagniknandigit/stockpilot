import { Target } from 'lucide-react'
import type { ForecastAccuracy } from '@/api/types'
import { Card } from '@/components/ui/Card'
import { formatWape } from './urgency'

/** Backtest result: model error vs a seasonal-naive baseline ("same weekday last week"). */
export function AccuracyCard({ accuracy }: { accuracy: ForecastAccuracy }) {
  const model = accuracy.model_wape ?? 0
  const baseline = accuracy.baseline_wape ?? 0
  const max = Math.max(model, baseline, 0.01)
  const better = accuracy.improvement_pct !== null && accuracy.improvement_pct > 0

  if (accuracy.model_wape === null || accuracy.baseline_wape === null) {
    return (
      <Card className="h-full p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-medium text-muted">Forecast accuracy</p>
          <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent-soft-foreground">
            <Target className="size-4" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-2 font-medium text-foreground">Not enough history yet</p>
        <p className="mt-1 text-xs text-muted">
          After a few weeks of sales, StockPilot backtests its forecasts against the last{' '}
          {accuracy.holdout_days} days and shows how accurate they are here.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-muted">Forecast accuracy</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {accuracy.improvement_pct === null
              ? '—'
              : `${better ? '' : '+'}${Math.abs(accuracy.improvement_pct).toFixed(1)}%`}
            <span className="ml-1.5 text-sm font-medium text-muted">
              {better ? 'lower error' : 'vs baseline'}
            </span>
          </p>
        </div>
        <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent-soft-foreground">
          <Target className="size-4" aria-hidden="true" />
        </span>
      </div>
      <dl className="mt-4 space-y-2.5 text-xs">
        {[
          { label: 'StockPilot model', value: accuracy.model_wape, color: 'bg-chart-1' },
          {
            label: 'Same-day-last-week baseline',
            value: accuracy.baseline_wape,
            color: 'bg-chart-3',
          },
        ].map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex justify-between">
              <dt className="text-muted">{row.label}</dt>
              <dd className="font-semibold text-foreground">{formatWape(row.value)} error</dd>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
              <div
                className={`h-full rounded-full ${row.color}`}
                style={{ width: `${((row.value ?? 0) / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">
        Backtested on the last {accuracy.holdout_days} days. WAPE = total absolute error ÷ units
        sold; lower is better.
      </p>
    </Card>
  )
}
